import fs from "fs/promises";
import path from "path";
import { saveJob } from "./agenticStorage.js";
import { generateAndStoreImage } from "./images.js";
import { slugify, timestampForId, truncateText } from "./utils.js";
import { listMcpServers, runMcpTool } from "./mcpRegistry.js";
import { runResolvedMcpTool } from "./mcpRuntime.js";
import { fetchWebDocument, truncateWebText } from "./webFetch.js";
import { ingestUrlToKnowledgePack } from "./knowledgeIngest.js";
import { getKnowledgePack, saveKnowledgePack } from "./storage.js";
import { runAutonomousPersonaImageScenario } from "./autonomousPersonaImage.js";
import { runAutonomousDecisionChainScenario } from "./autonomousDecisionChain.js";
import { generateTaskReport } from "./agenticReports.js";
import { executeToolWithBoundary } from "./toolRunner.js";
import { appendEvent, EVENT_TYPES, recordErrorEvent } from "../packages/core/events/index.js";
import { getObservabilityContext, logEvent } from "./observability.js";

const toolRegistry = new Map();

function nowIso() {
  return new Date().toISOString();
}

function assertWithinWorkspace(relativeOrAbsolutePath) {
  const root = process.cwd();
  const resolved = path.resolve(root, String(relativeOrAbsolutePath || ""));
  if (!resolved.startsWith(root)) {
    const err = new Error("Path must remain within workspace.");
    err.code = "TOOL_PATH_FORBIDDEN";
    throw err;
  }
  return resolved;
}

function normalizeHeaders(headers) {
  if (!headers || typeof headers !== "object") return {};
  const out = {};
  Object.entries(headers).forEach(([k, v]) => {
    out[String(k)] = String(v);
  });
  return out;
}

function toSearchableText(value) {
  try {
    return JSON.stringify(value || {}).toLowerCase();
  } catch {
    return String(value || "").toLowerCase();
  }
}

function hasAnyTerm(text, terms) {
  return terms.some((term) => text.includes(term));
}

export function registerTool(definition) {
  if (!definition?.id) {
    throw new Error("Tool id is required.");
  }
  toolRegistry.set(definition.id, definition);
}

export function listTools() {
  return [...toolRegistry.values()].map((tool) => ({
    id: tool.id,
    description: tool.description || "",
    inputSchema: tool.inputSchema || {}
  }));
}

export async function runTool(toolId, input, context = {}) {
  const tool = toolRegistry.get(toolId);
  if (!tool) {
    const err = new Error(`Unknown tool '${toolId}'.`);
    err.code = "UNKNOWN_TOOL";
    throw err;
  }
  const obs = getObservabilityContext();
  const requestId = context?.requestId || obs.requestId || null;
  const runId = context?.runId || obs.runId || null;
  const started = Date.now();
  await appendEvent({
    eventType: EVENT_TYPES.ToolInvoked,
    component: "tools.runTool",
    requestId,
    runId,
    data: {
      toolId,
      inputPreview: JSON.stringify(input || {}).slice(0, 500)
    }
  });
  try {
    const { result, timeoutMs, sanitizedInput } = await executeToolWithBoundary({
      toolId,
      input: input || {},
      context,
      execute: () => tool.run(input || {}, context)
    });
    const latencyMs = Date.now() - started;
    await appendEvent({
      eventType: EVENT_TYPES.ToolFinished,
      component: "tools.runTool",
      requestId,
      runId,
      latencyMs,
      data: {
        toolId,
        ok: true,
        timeoutMs,
        inputPreview: JSON.stringify(sanitizedInput || {}).slice(0, 500)
      }
    });
    logEvent("info", {
      component: "tools.runTool",
      eventType: "tool.finished",
      requestId,
      runId,
      latencyMs
    });
    return result;
  } catch (error) {
    const latencyMs = Date.now() - started;
    await recordErrorEvent({
      component: "tools.runTool",
      requestId,
      runId,
      error,
      data: {
        toolId
      }
    });
    await appendEvent({
      eventType: EVENT_TYPES.ToolFinished,
      component: "tools.runTool",
      requestId,
      runId,
      latencyMs,
      level: "error",
      error: {
        code: error?.code || "TOOL_ERROR",
        message: error?.message || "Tool execution failed."
      },
      data: {
        toolId,
        ok: false
      }
    });
    logEvent("error", {
      component: "tools.runTool",
      eventType: "tool.error",
      requestId,
      runId,
      latencyMs,
      error: {
        code: error?.code || "TOOL_ERROR",
        message: error?.message || "Tool execution failed."
      }
    });
    throw error;
  }
}

registerTool({
  id: "policy_gates",
  description: "Apply deterministic compliance gates to an intake object without LLMs.",
  inputSchema: {
    intake_obj: "object"
  },
  run: async (input) => {
    const intake = input?.intake_obj;
    if (!intake || typeof intake !== "object" || Array.isArray(intake)) {
      const err = new Error("intake_obj must be an object.");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }

    const searchable = toSearchableText(intake);
    const notes = String(intake.notes || "").toLowerCase();
    const workflowActions = intake.workflow_actions;
    const hasWorkflowActions = Array.isArray(workflowActions)
      ? workflowActions.length > 0
      : Boolean(workflowActions && typeof workflowActions === "object" ? Object.keys(workflowActions).length : workflowActions);

    const hasSensitiveDataSignal =
      hasAnyTerm(searchable, ["pii", "regulated", "sensitive", "confidential", "personal data"]) ||
      Boolean(intake.pii) ||
      Boolean(intake.regulated_data) ||
      Boolean(intake.sensitive_data);
    const hasExternalShareOrEmail = hasAnyTerm(searchable, [
      "external sharing",
      "external_share",
      "share externally",
      "email",
      "mail",
      "send externally"
    ]);
    const hasIdentityNonCompliantNote = hasAnyTerm(notes, [
      "employee mailbox",
      "runs as user",
      "personal account"
    ]);

    const complianceFailures = [];
    const requiredControls = [];
    const monitoringEvents = [];

    // Gate A: pii|regulated + workflow_actions
    if ((hasAnyTerm(searchable, ["pii", "regulated"]) || Boolean(intake.pii) || Boolean(intake.regulated_data)) && hasWorkflowActions) {
      complianceFailures.push("HIGH_RISK_FLOW_PREVENTED");
      requiredControls.push("AI Risk Assessment before go-live");
      monitoringEvents.push({
        event_type: "high_risk_flow_prevented",
        severity: "critical",
        details: "PII/regulated signal with workflow actions triggered preventive gate."
      });
    }

    // Gate B: notes mention employee mailbox / runs as user / personal account
    if (hasIdentityNonCompliantNote) {
      complianceFailures.push("IDENTITY_NONCOMPLIANT");
      requiredControls.push("Identity controls (non-human identity, JIT access)");
      monitoringEvents.push({
        event_type: "identity_noncompliant",
        severity: "critical",
        details: "Notes indicate non-compliant identity pattern (employee mailbox/user/personal account)."
      });
    }

    // Gate C: external sharing/email + sensitive data
    if (hasExternalShareOrEmail && hasSensitiveDataSignal) {
      complianceFailures.push("DLP_BLOCK_TRIGGERED");
      requiredControls.push("DLP on agent flows for external sharing/email actions");
      monitoringEvents.push({
        event_type: "dlp_block_triggered",
        severity: "critical",
        details: "External sharing/email combined with sensitive data signal triggered DLP block."
      });
    }

    if (complianceFailures.length) {
      requiredControls.push("Continuous monitoring and incident response readiness");
      monitoringEvents.push({
        event_type: "policy_gate_result",
        severity: "warning",
        details: `Compliance failures detected: ${complianceFailures.join(", ")}`
      });
    }

    return {
      compliance_failures: [...new Set(complianceFailures)],
      required_controls: [...new Set(requiredControls)],
      monitoring_events: monitoringEvents
    };
  }
});

registerTool({
  id: "read_json",
  description: "Read and parse a JSON file from an absolute path.",
  inputSchema: {
    path: "string (absolute path ending with .json)"
  },
  run: async (input) => {
    const rawPath = String(input?.path || "").trim();
    if (!rawPath) {
      const err = new Error("path is required");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    if (!path.isAbsolute(rawPath)) {
      const err = new Error("path must be absolute");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    if (!rawPath.toLowerCase().endsWith(".json")) {
      const err = new Error("path must end with .json");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    const fullPath = path.normalize(rawPath);
    const raw = await fs.readFile(fullPath, "utf8");
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const err = new Error("File is not valid JSON.");
      err.code = "INVALID_JSON";
      throw err;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      const err = new Error("JSON root must be an object.");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    return parsed;
  }
});

registerTool({
  id: "write_json",
  description: "Write JSON evidence artifacts under data/....",
  inputSchema: {
    path: "string (absolute path ending with .json)",
    object: "object"
  },
  run: async (input) => {
    const rawPath = String(input?.path || "").trim();
    if (!rawPath) {
      const err = new Error("path is required");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    if (!path.isAbsolute(rawPath)) {
      const err = new Error("path must be absolute");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    if (!rawPath.toLowerCase().endsWith(".json")) {
      const err = new Error("path must end with .json");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    const value = input?.object;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      const err = new Error("object must be a JSON object.");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    const fullPath = path.normalize(rawPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    const content = JSON.stringify(value, null, 2);
    await fs.writeFile(fullPath, content, "utf8");
    return {
      ok: true,
      path: fullPath,
      bytesWritten: Buffer.byteLength(content, "utf8")
    };
  }
});

registerTool({
  id: "write_text",
  description: "Write steering packet markdown under data/steering-packets/....",
  inputSchema: {
    path: "string (absolute path ending with .md)",
    text: "string"
  },
  run: async (input) => {
    const rawPath = String(input?.path || "").trim();
    if (!rawPath) {
      const err = new Error("path is required");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    if (!path.isAbsolute(rawPath)) {
      const err = new Error("path must be absolute");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    if (!rawPath.toLowerCase().endsWith(".md")) {
      const err = new Error("path must end with .md");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    const text = String(input?.text || "");
    const fullPath = path.normalize(rawPath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, text, "utf8");
    return {
      ok: true,
      path: fullPath,
      bytesWritten: Buffer.byteLength(text, "utf8")
    };
  }
});

registerTool({
  id: "ensure_dirs",
  description: "Ensure directories exist from input paths (supports absolute and relative paths).",
  inputSchema: {
    paths: "array (optional; absolute or relative directory paths)"
  },
  run: async (input) => {
    const requested = Array.isArray(input?.paths) ? input.paths : [];
    const paths = (requested.length ? requested : ["data/decision-log", "data/monitoring-events", "data/steering-packets"])
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value) => (path.isAbsolute(value) ? path.normalize(value) : path.resolve(process.cwd(), value)));
    if (!paths.length) {
      const err = new Error("paths must include at least one directory.");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }

    const created = [];
    const existing = [];
    for (const fullPath of paths) {
      const exists = await fs
        .stat(fullPath)
        .then((st) => st.isDirectory())
        .catch(() => false);
      await fs.mkdir(fullPath, { recursive: true });
      const normalizedOut = fullPath.endsWith(path.sep) ? fullPath : `${fullPath}${path.sep}`;
      if (!exists) created.push(normalizedOut);
      else existing.push(normalizedOut);
    }
    return { ok: true, created, existing };
  }
});

registerTool({
  id: "filesystem.ensure_dirs",
  description: "Ensure directories exist from input paths (supports absolute and relative paths).",
  inputSchema: {
    paths: "array (optional; absolute or relative directory paths)"
  },
  run: async (input) => {
    const tool = toolRegistry.get("ensure_dirs");
    return tool.run(input || {}, {});
  }
});

registerTool({
  id: "agentic.generate_report",
  description: "Generate a markdown report for an agentic task and persist it to disk.",
  inputSchema: {
    taskId: "string"
  },
  run: async (input) => {
    const taskId = String(input?.taskId || "").trim();
    if (!taskId) {
      const err = new Error("taskId is required");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    return generateTaskReport(taskId);
  }
});

registerTool({
  id: "persona.autonomous_decision_chain",
  description:
    "Run unattended multi-persona discussion rounds, synthesize a decision summary, action plan, and risks, and persist transcript/output files.",
  inputSchema: {
    prompt: "string",
    personaIds: "array (optional persona ids; defaults to task-selected personas)",
    mode: "string (optional: panel|debate-work-order, default debate-work-order)",
    rounds: "number (optional, default 2)",
    maxAgents: "number (optional, default 3)",
    model: "string (optional, default gpt-5-mini)",
    temperature: "number (optional, default 0.5)",
    maxWordsPerTurn: "number (optional, default 160)"
  },
  run: async (input, context = {}) => runAutonomousDecisionChainScenario(input, context)
});

registerTool({
  id: "persona.autonomous_image_brainstorm",
  description:
    "Run unattended multi-persona discussion rounds, synthesize final image instructions, generate image, and persist transcript/output files.",
  inputSchema: {
    prompt: "string",
    personaIds: "array (optional persona ids; defaults to task-selected personas)",
    mode: "string (optional: panel|debate-work-order, default debate-work-order)",
    rounds: "number (optional, default 2)",
    maxAgents: "number (optional, default 3)",
    model: "string (optional, default gpt-5-mini)",
    temperature: "number (optional, default 0.5)",
    maxWordsPerTurn: "number (optional, default 140)",
    generateImage: "boolean (optional, default true)",
    imageModel: "string (optional, default gpt-image-1)",
    imageSize: "string (optional, default 1024x1024)",
    imageQuality: "string (optional, default auto)"
  },
  run: async (input, context = {}) => runAutonomousPersonaImageScenario(input, context)
});

registerTool({
  id: "filesystem.read_text",
  description: "Read a UTF-8 text file from workspace.",
  inputSchema: {
    path: "string",
    maxChars: "number (optional, default 20000)"
  },
  run: async (input) => {
    const fullPath = assertWithinWorkspace(input.path);
    const raw = await fs.readFile(fullPath, "utf8");
    const maxChars = Number.isFinite(Number(input.maxChars)) ? Number(input.maxChars) : 20000;
    return {
      path: path.relative(process.cwd(), fullPath),
      content: truncateText(raw, Math.max(100, maxChars))
    };
  }
});

registerTool({
  id: "filesystem.write_text",
  description: "Write or append UTF-8 text file within workspace.",
  inputSchema: {
    path: "string",
    content: "string",
    append: "boolean (optional, default false)"
  },
  run: async (input) => {
    const fullPath = assertWithinWorkspace(input.path);
    const content = String(input.content || "");
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    if (input.append) {
      await fs.appendFile(fullPath, content, "utf8");
    } else {
      await fs.writeFile(fullPath, content, "utf8");
    }
    return {
      path: path.relative(process.cwd(), fullPath),
      bytesWritten: Buffer.byteLength(content, "utf8"),
      append: Boolean(input.append)
    };
  }
});

registerTool({
  id: "http.request",
  description: "Send an outbound HTTP request (GET/POST/etc).",
  inputSchema: {
    url: "string",
    method: "string (optional, default GET)",
    headers: "object (optional)",
    body: "string/object (optional)",
    timeoutMs: "number (optional, default 15000)"
  },
  run: async (input) => {
    const url = String(input.url || "").trim();
    if (!url) {
      const err = new Error("url is required");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    const method = String(input.method || "GET").toUpperCase();
    const headers = normalizeHeaders(input.headers);
    const timeoutMs = Number.isFinite(Number(input.timeoutMs)) ? Math.max(1000, Number(input.timeoutMs)) : 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const hasBody = typeof input.body !== "undefined" && method !== "GET" && method !== "HEAD";
      const body = hasBody
        ? (typeof input.body === "string" ? input.body : JSON.stringify(input.body))
        : undefined;
      if (hasBody && typeof input.body !== "string" && !headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal
      });
      const text = await response.text();
      return {
        url,
        status: response.status,
        ok: response.ok,
        bodyPreview: truncateText(text, 4000)
      };
    } finally {
      clearTimeout(timer);
    }
  }
});

registerTool({
  id: "openai.generate_image",
  description: "Generate an image from a prompt and persist it locally.",
  inputSchema: {
    prompt: "string",
    model: "string (optional, default gpt-image-1)",
    size: "string (optional, default 1024x1024)",
    quality: "string (optional, default auto)"
  },
  run: async (input, context = {}) => {
    const prompt = String(input.prompt || "").trim();
    if (!prompt) {
      const err = new Error("prompt is required");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    const image = await generateAndStoreImage({
      prompt,
      model: String(input.model || "gpt-image-1"),
      size: String(input.size || "1024x1024"),
      quality: String(input.quality || "auto"),
      user: context.user || null,
      contextType: context.taskId ? "task" : "tool",
      contextId: String(context.taskId || "")
    });
    return image;
  }
});

registerTool({
  id: "web.fetch",
  description: "Fetch a web page and extract readable text.",
  inputSchema: {
    url: "string",
    maxChars: "number (optional, default 12000)",
    includeHtml: "boolean (optional, default false)",
    discover: "boolean (optional, default true)",
    queryHint: "string (optional)"
  },
  run: async (input) => {
    const url = String(input.url || "").trim();
    if (!url) {
      const err = new Error("url is required");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    const doc = await fetchWebDocument(url, {
      discover: input.discover !== false,
      queryHint: String(input.queryHint || "")
    });
    const text = truncateWebText(doc.text || "", input.maxChars);
    return {
      url: doc.url,
      requestedUrl: doc.requestedUrl || "",
      discoveredFrom: doc.discoveredFrom || "",
      discoveryScore: Number(doc.discoveryScore || 0),
      title: doc.title,
      contentType: doc.contentType,
      retrievedAt: doc.retrievedAt,
      text,
      rawChars: doc.rawChars
    };
  }
});

registerTool({
  id: "knowledge.ingest_url",
  description: "Fetch a web page and save it as a knowledge pack.",
  inputSchema: {
    url: "string",
    id: "string (optional)",
    title: "string (optional)",
    description: "string (optional)",
    tags: "array|string (optional)",
    summarize: "boolean (optional, default true)",
    mode: "string (optional, create|append|overwrite)"
  },
  run: async (input) => {
    const { pack, ingestMeta } = await ingestUrlToKnowledgePack({
      url: input.url,
      id: input.id,
      title: input.title,
      description: input.description,
      tags: input.tags,
      summarize: input.summarize !== false
    });
    const mode = String(input.mode || "create").trim();
    if (mode === "append") {
      const existing = await getKnowledgePack(pack.id);
      const merged = {
        ...existing,
        title: pack.title || existing.title,
        description: pack.description || existing.description,
        tags: Array.from(new Set([...(existing.tags || []), ...(pack.tags || [])])),
        content: [existing.content, pack.content].filter(Boolean).join("\n\n"),
        updatedAt: new Date().toISOString(),
        sourceUrl: pack.sourceUrl || existing.sourceUrl,
        retrievedAt: pack.retrievedAt || existing.retrievedAt
      };
      await saveKnowledgePack(merged);
      return { pack: merged, ingestMeta };
    }
    if (mode !== "overwrite") {
      try {
        await getKnowledgePack(pack.id);
        const err = new Error(`Knowledge pack id '${pack.id}' already exists.`);
        err.code = "DUPLICATE_ID";
        throw err;
      } catch (error) {
        if (error.code !== "ENOENT") {
          if (error.code) throw error;
          throw error;
        }
      }
    }
    await saveKnowledgePack(pack);
    return { pack, ingestMeta };
  }
});

registerTool({
  id: "mcp.call",
  description: "Call a configured MCP server tool by server id and tool name.",
  inputSchema: {
    serverId: "string",
    tool: "string",
    input: "object (optional)"
  },
  run: async (input, context = {}) => {
    const serverId = String(input?.serverId || "").trim();
    const tool = String(input?.tool || "").trim();
    if (!serverId || !tool) {
      const err = new Error("serverId and tool are required.");
      err.code = "TOOL_VALIDATION_ERROR";
      throw err;
    }
    return runResolvedMcpTool(serverId, tool, input?.input || {}, context);
  }
});

registerTool({
  id: "jobs.enqueue",
  description: "Create a local job record for asynchronous execution.",
  inputSchema: {
    name: "string",
    payload: "object (optional)"
  },
  run: async (input, context = {}) => {
    const name = String(input.name || "").trim() || "agentic-job";
    const id = `${timestampForId()}-${slugify(name) || "job"}-${Math.random().toString(36).slice(2, 7)}`;
    const job = {
      id,
      name,
      payload: input.payload || {},
      status: "queued",
      createdAt: nowIso(),
      createdBy: context?.user?.id || null,
      createdByUsername: context?.user?.username || null
    };
    await saveJob(job);
    return {
      jobId: id,
      status: job.status
    };
  }
});

function registerMcpTools() {
  const servers = listMcpServers({ includeTools: true });
  servers.forEach((server) => {
    (server.tools || []).forEach((tool) => {
      registerTool({
        id: `mcp.${server.id}.${tool.name}`,
        description: tool.description || `MCP tool ${tool.name} on server ${server.id}.`,
        inputSchema: tool.inputSchema || {},
        run: async (input, context = {}) => {
          return runMcpTool(server.id, tool.name, input, context);
        }
      });
    });
  });
}

registerMcpTools();
