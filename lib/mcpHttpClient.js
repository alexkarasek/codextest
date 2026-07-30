const DEFAULT_PROTOCOL_VERSION = "2025-06-18";

function createMcpError(message, code = "MCP_HTTP_ERROR") {
  const err = new Error(message);
  err.code = code;
  return err;
}

function assertLocalEndpoint(endpoint, server = {}) {
  let parsed;
  try {
    parsed = new URL(String(endpoint || "").trim());
  } catch {
    throw createMcpError("A valid MCP HTTP endpoint URL is required.", "MCP_CONFIG_ERROR");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw createMcpError("MCP HTTP endpoint must use http or https.", "MCP_CONFIG_ERROR");
  }
  const host = parsed.hostname.toLowerCase();
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!server.allow_remote && !localHosts.has(host)) {
    throw createMcpError("External MCP HTTP endpoints must be localhost unless allow_remote is true.", "MCP_CONFIG_ERROR");
  }
  return parsed.toString();
}

function parseSseBody(text) {
  const events = [];
  let current = [];
  for (const line of String(text || "").split(/\r?\n/)) {
    if (!line.trim()) {
      if (current.length) {
        events.push(current.join("\n"));
        current = [];
      }
      continue;
    }
    if (line.startsWith("data:")) {
      current.push(line.slice(5).trimStart());
    }
  }
  if (current.length) events.push(current.join("\n"));
  for (let i = events.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(events[i]);
    } catch {
      // Continue looking for a JSON event.
    }
  }
  return null;
}

async function readMcpResponse(response) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const body = await response.text();
  if (!response.ok) {
    throw createMcpError(`MCP HTTP request failed with ${response.status}: ${body.slice(0, 300)}`, "MCP_HTTP_STATUS");
  }
  if (contentType.includes("text/event-stream")) {
    const parsed = parseSseBody(body);
    if (!parsed) throw createMcpError("MCP SSE response did not include a JSON data event.", "MCP_HTTP_PARSE_ERROR");
    return parsed;
  }
  try {
    return body ? JSON.parse(body) : null;
  } catch {
    throw createMcpError("MCP HTTP response was not valid JSON.", "MCP_HTTP_PARSE_ERROR");
  }
}

async function postJsonRpc(endpoint, payload, { sessionId = "", headers = {}, protocolVersion = DEFAULT_PROTOCOL_VERSION } = {}) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": protocolVersion,
      ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      ...headers
    },
    body: JSON.stringify(payload)
  });
  return {
    sessionId: response.headers.get("mcp-session-id") || sessionId,
    body: await readMcpResponse(response)
  };
}

function assertJsonRpcOk(response, method) {
  if (response?.error) {
    const message = response.error?.message || `MCP method '${method}' failed.`;
    throw createMcpError(message, "MCP_JSONRPC_ERROR");
  }
  return response?.result;
}

async function createSession(server) {
  const endpoint = assertLocalEndpoint(server.endpoint || server.url, server);
  const protocolVersion = String(server.protocol_version || DEFAULT_PROTOCOL_VERSION);
  const headers = server.headers && typeof server.headers === "object" ? server.headers : {};
  const init = await postJsonRpc(
    endpoint,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: {
          name: "persona-debate-local",
          version: "1.0.0"
        }
      }
    },
    { headers, protocolVersion }
  );
  assertJsonRpcOk(init.body, "initialize");
  await postJsonRpc(
    endpoint,
    {
      jsonrpc: "2.0",
      method: "notifications/initialized"
    },
    { sessionId: init.sessionId, headers, protocolVersion }
  );
  return { endpoint, sessionId: init.sessionId, headers, protocolVersion };
}

export function isHttpMcpServer(server = {}) {
  const transport = String(server.transport || "").trim().toLowerCase();
  return ["http", "streamable_http", "streamable-http"].includes(transport) && Boolean(server.endpoint || server.url);
}

export async function listHttpMcpTools(server) {
  const session = await createSession(server);
  const response = await postJsonRpc(
    session.endpoint,
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    },
    session
  );
  const result = assertJsonRpcOk(response.body, "tools/list");
  return Array.isArray(result?.tools)
    ? result.tools.map((tool) => ({
        name: String(tool.name || ""),
        description: String(tool.description || ""),
        inputSchema: tool.inputSchema || {}
      })).filter((tool) => tool.name)
    : [];
}

export async function callHttpMcpTool(server, toolName, input = {}) {
  const session = await createSession(server);
  const response = await postJsonRpc(
    session.endpoint,
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: String(toolName || ""),
        arguments: input && typeof input === "object" ? input : {}
      }
    },
    session
  );
  return assertJsonRpcOk(response.body, "tools/call");
}
