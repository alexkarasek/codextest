import crypto from "crypto";
import { AsyncLocalStorage } from "async_hooks";

const contextStore = new AsyncLocalStorage();

function nowIso() {
  return new Date().toISOString();
}

export function generateCorrelationId(prefix = "req") {
  const base = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `${prefix}_${base}`;
}

export function getObservabilityContext() {
  return contextStore.getStore() || {};
}

export function runWithObservabilityContext(partial, fn) {
  const current = getObservabilityContext();
  const next = {
    ...current,
    ...(partial || {})
  };
  return contextStore.run(next, fn);
}

export function logEvent(level, fields = {}) {
  const ctx = getObservabilityContext();
  const payload = {
    timestamp: nowIso(),
    level: String(level || "info"),
    requestId: fields.requestId || ctx.requestId || null,
    runId: fields.runId || ctx.runId || null,
    component: fields.component || "app",
    eventType: fields.eventType || "log",
    latencyMs: Number.isFinite(Number(fields.latencyMs)) ? Number(fields.latencyMs) : null,
    error: fields.error || null,
    ...fields
  };
  const line = JSON.stringify(payload);
  if (payload.level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function requestCorrelationMiddleware(req, res, next) {
  const incoming = String(req.headers["x-request-id"] || "").trim();
  const requestId = incoming || generateCorrelationId("req");
  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  runWithObservabilityContext({ requestId }, () => next());
}

export function requestLoggingMiddleware(req, res, next) {
  const started = Date.now();
  logEvent("info", {
    component: "http",
    eventType: "request.started",
    method: req.method,
    path: req.path,
    requestId: req.requestId || null
  });

  res.on("finish", () => {
    const user = req.auth?.user || null;
    logEvent(res.statusCode >= 500 ? "error" : "info", {
      component: "http",
      eventType: "request.finished",
      requestId: req.requestId || null,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      latencyMs: Date.now() - started,
      userId: user?.id || null,
      username: user?.username || null
    });
  });

  next();
}
