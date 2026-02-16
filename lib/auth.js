import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { SETTINGS_DIR, readJsonFile, writeJsonFile } from "./storage.js";

const USERS_PATH = path.join(SETTINGS_DIR, "users.json");
const API_KEYS_PATH = path.join(SETTINGS_DIR, "api-keys.json");
const USAGE_PATH = path.join(SETTINGS_DIR, "usage.jsonl");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

const sessions = new Map();

const DEFAULT_PERMISSIONS_BY_ROLE = {
  admin: {
    manageUsers: true,
    managePersonas: true,
    manageKnowledge: true,
    runDebates: true,
    chat: true,
    viewGovernance: true
  },
  user: {
    manageUsers: false,
    managePersonas: true,
    manageKnowledge: true,
    runDebates: true,
    chat: true,
    viewGovernance: true
  }
};

function nowIso() {
  return new Date().toISOString();
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function stableJsonHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  if (!salt || !hash) return false;
  const check = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(hash, "hex"));
}

function normalizePermissions(role, permissions = null) {
  const base = DEFAULT_PERMISSIONS_BY_ROLE[role] || DEFAULT_PERMISSIONS_BY_ROLE.user;
  if (!permissions || typeof permissions !== "object") return { ...base };
  return {
    ...base,
    ...permissions
  };
}

export function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    permissions: user.permissions || normalizePermissions(user.role),
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
    lastLoginAt: user.lastLoginAt || null
  };
}

async function readUsers() {
  try {
    const data = await readJsonFile(USERS_PATH);
    return Array.isArray(data.users) ? data.users : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeUsers(users) {
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await writeJsonFile(USERS_PATH, { users });
}

async function readApiKeys() {
  try {
    const data = await readJsonFile(API_KEYS_PATH);
    return Array.isArray(data.keys) ? data.keys : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeApiKeys(keys) {
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await writeJsonFile(API_KEYS_PATH, { keys });
}

export async function ensureAuthFiles() {
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  const [users, keys] = await Promise.all([readUsers(), readApiKeys()]);
  if (!Array.isArray(users)) await writeUsers([]);
  if (!Array.isArray(keys)) await writeApiKeys([]);
}

export async function hasAnyUsers() {
  const users = await readUsers();
  return users.length > 0;
}

export async function listUsers() {
  const users = await readUsers();
  return users.map(sanitizeUser).sort((a, b) => a.username.localeCompare(b.username));
}

export async function getUserById(userId) {
  const users = await readUsers();
  return users.find((u) => u.id === userId) || null;
}

export async function getUserByUsername(username) {
  const key = normalizeUsername(username);
  const users = await readUsers();
  return users.find((u) => u.username === key) || null;
}

export async function createUser({ username, password, role = "user", permissions = null }) {
  const users = await readUsers();
  const normalized = normalizeUsername(username);
  if (!normalized) {
    const err = new Error("username is required");
    err.code = "VALIDATION_ERROR";
    throw err;
  }
  if (users.some((u) => u.username === normalized)) {
    const err = new Error(`username '${normalized}' already exists`);
    err.code = "DUPLICATE_USER";
    throw err;
  }
  if (!String(password || "").trim() || String(password || "").length < 8) {
    const err = new Error("password must be at least 8 characters");
    err.code = "WEAK_PASSWORD";
    throw err;
  }
  const { salt, hash } = hashPassword(password);
  const user = {
    id: uid("usr"),
    username: normalized,
    role: role === "admin" ? "admin" : "user",
    permissions: normalizePermissions(role, permissions),
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastLoginAt: null
  };
  users.push(user);
  await writeUsers(users);
  return sanitizeUser(user);
}

export async function updateUser(userId, patch) {
  const users = await readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) {
    const err = new Error("user not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  const current = users[idx];
  const next = { ...current };

  if (typeof patch?.role === "string") {
    next.role = patch.role === "admin" ? "admin" : "user";
  }
  if (patch?.permissions && typeof patch.permissions === "object") {
    next.permissions = normalizePermissions(next.role, patch.permissions);
  } else {
    next.permissions = normalizePermissions(next.role, next.permissions);
  }
  if (typeof patch?.password === "string" && patch.password.trim()) {
    if (patch.password.length < 8) {
      const err = new Error("password must be at least 8 characters");
      err.code = "WEAK_PASSWORD";
      throw err;
    }
    const { salt, hash } = hashPassword(patch.password);
    next.passwordHash = hash;
    next.passwordSalt = salt;
  }
  next.updatedAt = nowIso();
  users[idx] = next;
  await writeUsers(users);
  return sanitizeUser(next);
}

export async function deleteUser(userId) {
  const users = await readUsers();
  const remaining = users.filter((u) => u.id !== userId);
  if (remaining.length === users.length) return false;
  if (!remaining.some((u) => u.role === "admin")) {
    const err = new Error("cannot delete the last admin user");
    err.code = "LAST_ADMIN";
    throw err;
  }
  await writeUsers(remaining);
  return true;
}

export async function authenticateUser(username, password) {
  const user = await getUserByUsername(username);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordSalt, user.passwordHash)) return null;
  const users = await readUsers();
  const idx = users.findIndex((u) => u.id === user.id);
  if (idx >= 0) {
    users[idx].lastLoginAt = nowIso();
    users[idx].updatedAt = nowIso();
    await writeUsers(users);
  }
  return sanitizeUser(users[idx] || user);
}

export function createSession(user) {
  const token = `sess_${crypto.randomBytes(24).toString("hex")}`;
  sessions.set(token, {
    token,
    userId: user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

export async function getSessionUserByToken(token) {
  if (!token || !sessions.has(token)) return null;
  const session = sessions.get(token);
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, session);
  const user = await getUserById(session.userId);
  return user ? sanitizeUser(user) : null;
}

export function revokeSession(token) {
  if (!token) return;
  sessions.delete(token);
}

export async function createApiKey({ userId, name = "" }) {
  const user = await getUserById(userId);
  if (!user) {
    const err = new Error("user not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  const keys = await readApiKeys();
  const raw = `pk_${crypto.randomBytes(24).toString("hex")}`;
  const hash = stableJsonHash(raw);
  const prefix = raw.slice(0, 10);
  const apiKey = {
    id: uid("key"),
    userId,
    name: String(name || "").trim() || "API Key",
    prefix,
    keyHash: hash,
    createdAt: nowIso(),
    lastUsedAt: null,
    revokedAt: null
  };
  keys.push(apiKey);
  await writeApiKeys(keys);
  return {
    id: apiKey.id,
    userId: apiKey.userId,
    name: apiKey.name,
    prefix: apiKey.prefix,
    createdAt: apiKey.createdAt,
    rawKey: raw
  };
}

export async function listApiKeys({ userId = null } = {}) {
  const keys = await readApiKeys();
  return keys
    .filter((k) => !userId || k.userId === userId)
    .map((k) => ({
      id: k.id,
      userId: k.userId,
      name: k.name,
      prefix: k.prefix,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function revokeApiKey(keyId, actorUser) {
  const keys = await readApiKeys();
  const idx = keys.findIndex((k) => k.id === keyId);
  if (idx < 0) return false;
  const target = keys[idx];
  if (actorUser.role !== "admin" && target.userId !== actorUser.id) {
    const err = new Error("forbidden");
    err.code = "FORBIDDEN";
    throw err;
  }
  keys[idx] = { ...target, revokedAt: nowIso() };
  await writeApiKeys(keys);
  return true;
}

export async function authenticateApiKey(rawKey) {
  if (!rawKey) return null;
  const hash = stableJsonHash(rawKey);
  const keys = await readApiKeys();
  const key = keys.find((k) => k.keyHash === hash && !k.revokedAt);
  if (!key) return null;
  const user = await getUserById(key.userId);
  if (!user) return null;
  key.lastUsedAt = nowIso();
  await writeApiKeys(keys);
  return {
    user: sanitizeUser(user),
    apiKey: {
      id: key.id,
      userId: key.userId,
      name: key.name,
      prefix: key.prefix
    }
  };
}

export function hasPermission(user, permission) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return Boolean(user.permissions?.[permission]);
}

export async function appendUsageLog(entry) {
  await fs.mkdir(SETTINGS_DIR, { recursive: true });
  await fs.appendFile(USAGE_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function getUsageSummary(limit = 500) {
  let raw = "";
  try {
    raw = await fs.readFile(USAGE_PATH, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { byUser: [], recent: [] };
    throw error;
  }
  const rows = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const byUserMap = new Map();
  for (const row of rows) {
    const key = row.userId || "anonymous";
    if (!byUserMap.has(key)) {
      byUserMap.set(key, {
        userId: key,
        username: row.username || "anonymous",
        requests: 0,
        lastSeenAt: row.ts || null
      });
    }
    const agg = byUserMap.get(key);
    agg.requests += 1;
    if (!agg.lastSeenAt || String(row.ts || "") > String(agg.lastSeenAt || "")) {
      agg.lastSeenAt = row.ts;
    }
  }
  return {
    byUser: [...byUserMap.values()].sort((a, b) => b.requests - a.requests),
    recent: rows.slice(-100).reverse()
  };
}

export function parseCookie(cookieHeader, name) {
  const header = String(cookieHeader || "");
  const pairs = header.split(";").map((p) => p.trim());
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = pair.slice(0, idx).trim();
    if (key !== name) continue;
    return decodeURIComponent(pair.slice(idx + 1));
  }
  return "";
}
