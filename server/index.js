import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import personasRouter from "./routes/personas.js";
import debatesRouter from "./routes/debates.js";
import adminRouter from "./routes/admin.js";
import topicsRouter from "./routes/topics.js";
import knowledgeRouter from "./routes/knowledge.js";
import personaChatsRouter from "./routes/personaChats.js";
import simpleChatsRouter from "./routes/simpleChats.js";
import settingsRouter from "./routes/settings.js";
import authRouter from "./routes/auth.js";
import { ensureDataDirs } from "../lib/storage.js";
import { ensureAuthFiles } from "../lib/auth.js";
import { sendError } from "./response.js";
import {
  getOpenAIApiKey,
  getServerPort,
  getSettingsPath,
  loadSettings
} from "../lib/config.js";
import { attachAuth, requireAuth, requirePermission, usageAudit } from "./authMiddleware.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, "../client");

const app = express();
loadSettings();
const PORT = getServerPort();

await ensureDataDirs();
await ensureAuthFiles();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(clientDir));
app.use(attachAuth);
app.use(usageAudit());

app.get("/health", (_req, res) => {
  res.json({ ok: true, data: { status: "up" } });
});

app.use("/api/auth", authRouter);
app.use("/api/personas", requireAuth, personasRouter);
app.use("/api/debates", requireAuth, debatesRouter);
app.use("/api/admin", requireAuth, requirePermission("viewGovernance"), adminRouter);
app.use("/api/topics", requireAuth, topicsRouter);
app.use("/api/knowledge", requireAuth, knowledgeRouter);
app.use("/api/persona-chats", requireAuth, personaChatsRouter);
app.use("/api/simple-chats", requireAuth, simpleChatsRouter);
app.use("/api/settings", requireAuth, settingsRouter);

app.use((req, res) => {
  sendError(res, 404, "NOT_FOUND", `Route ${req.method} ${req.path} not found.`);
});

app.use((error, _req, res, _next) => {
  sendError(res, 500, "SERVER_ERROR", error.message || "Unexpected server error.");
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!getOpenAIApiKey()) {
    console.warn(
      `OpenAI API key not configured. Set openaiApiKey in ${getSettingsPath()} to run debates.`
    );
  }
});
