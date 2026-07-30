import { spawn } from "child_process";

const DEFAULT_PROTOCOL_VERSION = "2024-11-05";
const DEFAULT_TIMEOUT_MS = 30000;

function createMcpError(message, code = "MCP_STDIO_ERROR") {
  const err = new Error(message);
  err.code = code;
  return err;
}

function assertStdioCommand(command) {
  const value = String(command || "").trim();
  if (!value) {
    throw createMcpError("MCP stdio command is required.", "MCP_CONFIG_ERROR");
  }
  if (!value.startsWith("/")) {
    throw createMcpError("MCP stdio command must be an absolute path.", "MCP_CONFIG_ERROR");
  }
  return value;
}

function normalizeArgs(args) {
  return Array.isArray(args) ? args.map((arg) => String(arg)) : [];
}

function normalizeEnv(env) {
  if (!env || typeof env !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(env)) {
    out[String(key)] = String(value);
  }
  return out;
}

function assertJsonRpcOk(response, method) {
  if (response?.error) {
    const message = response.error?.message || `MCP method '${method}' failed.`;
    throw createMcpError(message, "MCP_JSONRPC_ERROR");
  }
  return response?.result;
}

function createSession(server) {
  const command = assertStdioCommand(server.command);
  const child = spawn(command, normalizeArgs(server.args), {
    cwd: server.cwd ? String(server.cwd) : undefined,
    env: {
      ...process.env,
      ...normalizeEnv(server.env)
    },
    stdio: ["pipe", "pipe", "pipe"]
  });
  let buffer = "";
  let stderr = "";
  const pending = new Map();

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let idx = buffer.indexOf("\n");
    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) {
        try {
          const message = JSON.parse(line);
          const waiter = pending.get(message.id);
          if (waiter) {
            pending.delete(message.id);
            waiter.resolve(message);
          }
        } catch {
          // Ignore non-JSON stdout lines from local scripts.
        }
      }
      idx = buffer.indexOf("\n");
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.on("error", (error) => {
    for (const waiter of pending.values()) {
      waiter.reject(error);
    }
    pending.clear();
  });

  child.on("exit", (code, signal) => {
    if (!pending.size) return;
    const suffix = stderr.trim() ? `: ${stderr.trim().slice(0, 500)}` : "";
    const err = createMcpError(`MCP stdio process exited before responding (${code ?? signal})${suffix}`, "MCP_STDIO_EXIT");
    for (const waiter of pending.values()) {
      waiter.reject(err);
    }
    pending.clear();
  });

  function request(method, params = undefined) {
    const id = request.nextId++;
    const timeoutMs = Math.max(1000, Number(server.timeout_ms || DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      ...(typeof params === "undefined" ? {} : { params })
    };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(createMcpError(`MCP stdio method '${method}' timed out after ${timeoutMs}ms`, "MCP_STDIO_TIMEOUT"));
      }, timeoutMs);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      child.stdin.write(`${JSON.stringify(payload)}\n`, "utf8", (error) => {
        if (!error) return;
        pending.delete(id);
        clearTimeout(timer);
        reject(error);
      });
    });
  }
  request.nextId = 1;

  function notify(method, params = undefined) {
    const payload = {
      jsonrpc: "2.0",
      method,
      ...(typeof params === "undefined" ? {} : { params })
    };
    child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  function close() {
    child.stdin.end();
    if (!child.killed) child.kill();
  }

  return { request, notify, close };
}

async function withSession(server, fn) {
  const session = createSession(server);
  try {
    const init = await session.request("initialize", {
      protocolVersion: String(server.protocol_version || DEFAULT_PROTOCOL_VERSION),
      capabilities: {},
      clientInfo: {
        name: "persona-debate-local",
        version: "1.0.0"
      }
    });
    assertJsonRpcOk(init, "initialize");
    session.notify("notifications/initialized");
    return await fn(session);
  } finally {
    session.close();
  }
}

export function isStdioMcpServer(server = {}) {
  return String(server.transport || "").trim().toLowerCase() === "stdio" && Boolean(server.command);
}

export async function listStdioMcpTools(server) {
  return withSession(server, async (session) => {
    const response = await session.request("tools/list", {});
    const result = assertJsonRpcOk(response, "tools/list");
    return Array.isArray(result?.tools)
      ? result.tools.map((tool) => ({
          name: String(tool.name || ""),
          description: String(tool.description || ""),
          inputSchema: tool.inputSchema || {}
        })).filter((tool) => tool.name)
      : [];
  });
}

export async function callStdioMcpTool(server, toolName, input = {}) {
  return withSession(server, async (session) => {
    const response = await session.request("tools/call", {
      name: String(toolName || ""),
      arguments: input && typeof input === "object" ? input : {}
    });
    return assertJsonRpcOk(response, "tools/call");
  });
}
