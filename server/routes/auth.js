import express from "express";
import {
  createApiKey,
  createSession,
  createUser,
  deleteUser,
  getUsageSummary,
  hasAnyUsers,
  listApiKeys,
  listUsers,
  revokeApiKey,
  revokeSession,
  parseCookie,
  sanitizeUser,
  updateUser,
  getUserById,
  authenticateUser
} from "../../lib/auth.js";
import { sendError, sendOk } from "../response.js";
import { requireAuth, requirePermission } from "../authMiddleware.js";

const router = express.Router();

function setSessionCookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `pd_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "pd_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
}

router.get("/me", async (req, res) => {
  const bootstrapped = await hasAnyUsers();
  sendOk(res, {
    authenticated: Boolean(req.auth?.user),
    bootstrapRequired: !bootstrapped,
    user: req.auth?.user ? sanitizeUser(req.auth.user) : null
  });
});

router.get("/sso/status", (_req, res) => {
  sendOk(res, {
    enabled: false,
    providersSupportedFuture: ["okta", "entra"],
    message: "SSO is not enabled yet. Use local username/password or API keys."
  });
});

router.post("/bootstrap", async (req, res) => {
  const hasUsers = await hasAnyUsers();
  if (hasUsers) {
    sendError(res, 409, "ALREADY_BOOTSTRAPPED", "Users already exist. Bootstrap is disabled.");
    return;
  }
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  try {
    const user = await createUser({ username, password, role: "admin" });
    const token = createSession(user);
    setSessionCookie(res, token);
    sendOk(res, { user, bootstrapRequired: false }, 201);
  } catch (error) {
    sendError(res, 400, error.code || "VALIDATION_ERROR", error.message);
  }
});

router.post("/login", async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const user = await authenticateUser(username, password);
  if (!user) {
    sendError(res, 401, "INVALID_CREDENTIALS", "Invalid username or password.");
    return;
  }
  const token = createSession(user);
  setSessionCookie(res, token);
  sendOk(res, { user });
});

router.post("/logout", requireAuth, (req, res) => {
  const bearer = String(req.headers.authorization || "").startsWith("Bearer ")
    ? String(req.headers.authorization || "").slice(7).trim()
    : "";
  const cookieToken = parseCookie(req.headers.cookie, "pd_session");
  const sessionToken = bearer || cookieToken || "";
  if (sessionToken) revokeSession(sessionToken);
  clearSessionCookie(res);
  sendOk(res, { loggedOut: true });
});

router.get("/users", requireAuth, requirePermission("manageUsers"), async (_req, res) => {
  const users = await listUsers();
  sendOk(res, { users });
});

router.post("/users", requireAuth, requirePermission("manageUsers"), async (req, res) => {
  const username = String(req.body?.username || "").trim();
  const password = String(req.body?.password || "");
  const role = String(req.body?.role || "user");
  const permissions = req.body?.permissions || null;
  try {
    const user = await createUser({ username, password, role, permissions });
    sendOk(res, { user }, 201);
  } catch (error) {
    sendError(res, 400, error.code || "VALIDATION_ERROR", error.message);
  }
});

router.put("/users/:userId", requireAuth, requirePermission("manageUsers"), async (req, res) => {
  try {
    const user = await updateUser(req.params.userId, req.body || {});
    sendOk(res, { user });
  } catch (error) {
    if (error.code === "NOT_FOUND") {
      sendError(res, 404, "NOT_FOUND", "User not found.");
      return;
    }
    sendError(res, 400, error.code || "VALIDATION_ERROR", error.message);
  }
});

router.delete("/users/:userId", requireAuth, requirePermission("manageUsers"), async (req, res) => {
  try {
    const ok = await deleteUser(req.params.userId);
    if (!ok) {
      sendError(res, 404, "NOT_FOUND", "User not found.");
      return;
    }
    sendOk(res, { deleted: req.params.userId });
  } catch (error) {
    sendError(res, 400, error.code || "DELETE_FAILED", error.message);
  }
});

router.get("/api-keys", requireAuth, async (req, res) => {
  const scope = String(req.query.scope || "mine");
  const isAdmin = req.auth.user.role === "admin";
  const keys = await listApiKeys({
    userId: scope === "all" && isAdmin ? null : req.auth.user.id
  });
  sendOk(res, { keys });
});

router.post("/api-keys", requireAuth, async (req, res) => {
  const userId = String(req.body?.userId || "").trim();
  const targetUserId = userId || req.auth.user.id;
  if (targetUserId !== req.auth.user.id && req.auth.user.role !== "admin") {
    sendError(res, 403, "FORBIDDEN", "Only admins can create keys for other users.");
    return;
  }
  const target = await getUserById(targetUserId);
  if (!target) {
    sendError(res, 404, "NOT_FOUND", "Target user not found.");
    return;
  }
  try {
    const key = await createApiKey({
      userId: targetUserId,
      name: String(req.body?.name || "").trim()
    });
    sendOk(res, { key }, 201);
  } catch (error) {
    sendError(res, 400, error.code || "CREATE_KEY_FAILED", error.message);
  }
});

router.delete("/api-keys/:keyId", requireAuth, async (req, res) => {
  try {
    const ok = await revokeApiKey(req.params.keyId, req.auth.user);
    if (!ok) {
      sendError(res, 404, "NOT_FOUND", "API key not found.");
      return;
    }
    sendOk(res, { revoked: req.params.keyId });
  } catch (error) {
    sendError(res, 403, error.code || "FORBIDDEN", error.message);
  }
});

router.get("/usage", requireAuth, requirePermission("viewGovernance"), async (req, res) => {
  const data = await getUsageSummary(1500);
  sendOk(res, data);
});

export default router;
