import {
  appendUsageLog,
  authenticateApiKey,
  getSessionUserByToken,
  hasAnyUsers,
  hasPermission,
  parseCookie
} from "../lib/auth.js";
import { sendError } from "./response.js";

export async function attachAuth(req, _res, next) {
  req.auth = {
    user: null,
    method: null,
    apiKey: null
  };

  try {
    const bearer = String(req.headers.authorization || "").startsWith("Bearer ")
      ? String(req.headers.authorization || "").slice(7).trim()
      : "";
    const xApiKey = String(req.headers["x-api-key"] || "").trim();
    const cookieToken = parseCookie(req.headers.cookie, "pd_session");
    const sessionToken = bearer || cookieToken;

    if (xApiKey) {
      const viaKey = await authenticateApiKey(xApiKey);
      if (viaKey?.user) {
        req.auth = {
          user: viaKey.user,
          method: "api_key",
          apiKey: viaKey.apiKey
        };
        next();
        return;
      }
    }

    if (sessionToken) {
      const user = await getSessionUserByToken(sessionToken);
      if (user) {
        req.auth = {
          user,
          method: "session",
          apiKey: null
        };
      }
    }
  } catch {
    // swallow auth parse errors; request proceeds unauthenticated
  }

  next();
}

export async function requireAuth(req, res, next) {
  const hasUsers = await hasAnyUsers();
  if (!hasUsers) {
    sendError(res, 401, "BOOTSTRAP_REQUIRED", "No users found. Create the first admin account.");
    return;
  }
  if (!req.auth?.user) {
    sendError(res, 401, "UNAUTHORIZED", "Authentication required.");
    return;
  }
  next();
}

export function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.auth?.user) {
      sendError(res, 401, "UNAUTHORIZED", "Authentication required.");
      return;
    }
    if (!hasPermission(req.auth.user, permission)) {
      sendError(res, 403, "FORBIDDEN", `Missing permission: ${permission}`);
      return;
    }
    next();
  };
}

export function requireApiKeyAuth(req, res, next) {
  if (!req.auth?.user) {
    sendError(res, 401, "UNAUTHORIZED", "Authentication required.");
    return;
  }
  if (req.auth?.method !== "api_key") {
    sendError(res, 401, "UNAUTHORIZED", "x-api-key authentication required for this endpoint.");
    return;
  }
  next();
}

export function usageAudit() {
  return (req, res, next) => {
    const started = Date.now();
    res.on("finish", () => {
      if (!req.path.startsWith("/api")) return;
      const user = req.auth?.user || null;
      appendUsageLog({
        ts: new Date().toISOString(),
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - started,
        userId: user?.id || null,
        username: user?.username || null,
        authMethod: req.auth?.method || "none",
        apiKeyId: req.auth?.apiKey?.id || null
      }).catch(() => {});
    });
    next();
  };
}
