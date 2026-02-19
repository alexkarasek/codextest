import fs from "fs/promises";
import path from "path";
import { saveJob } from "./agenticStorage.js";
import { generateAndStoreImage } from "./images.js";
import { slugify, timestampForId, truncateText } from "./utils.js";
import { listMcpServers, runMcpTool } from "./mcpRegistry.js";
import { fetchWebDocument, truncateWebText } from "./webFetch.js";
import { ingestUrlToKnowledgePack } from "./knowledgeIngest.js";
import { getKnowledgePack, saveKnowledgePack } from "./storage.js";

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
  return tool.run(input || {}, context);
}

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
