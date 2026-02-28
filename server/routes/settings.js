import express from "express";
import fs from "fs/promises";
import path from "path";
import multer from "multer";
import { sendError, sendOk } from "../response.js";
import {
  getResponsibleAiPolicy,
  saveResponsibleAiPolicy
} from "../../lib/responsibleAi.js";
import { getWebPolicy, saveWebPolicy } from "../../lib/webPolicy.js";
import { formatZodError, responsibleAiPolicySchema, webPolicySchema } from "../../lib/validators.js";
import { getThemeSettings, saveThemeSettings } from "../../lib/themeSettings.js";
import { IMAGES_DIR } from "../../lib/storage.js";
import { getImageGenerationStatus, listModelCatalog } from "../../lib/modelCatalog.js";
import { createAgentProviderRegistry } from "../../src/agents/agentProviderRegistry.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});
const LOGO_DIR = path.join(IMAGES_DIR, "logo");
const ALLOWED_LOGO_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);

function extFromUpload(file) {
  const byName = path.extname(String(file?.originalname || "")).toLowerCase();
  if (ALLOWED_LOGO_EXT.has(byName)) return byName;
  const mime = String(file?.mimetype || "").toLowerCase();
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("svg")) return ".svg";
  return "";
}

router.get("/responsible-ai", async (_req, res) => {
  try {
    const policy = await getResponsibleAiPolicy();
    sendOk(res, { policy });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to load Responsible AI policy: ${error.message}`);
  }
});

router.put("/responsible-ai", async (req, res) => {
  const parsed = responsibleAiPolicySchema.safeParse(req.body?.policy ?? req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid Responsible AI policy payload.", formatZodError(parsed.error));
    return;
  }

  try {
    const saved = await saveResponsibleAiPolicy(parsed.data);
    sendOk(res, { policy: saved });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to save Responsible AI policy: ${error.message}`);
  }
});

router.get("/web", async (_req, res) => {
  try {
    const policy = await getWebPolicy();
    sendOk(res, { policy });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to load web policy: ${error.message}`);
  }
});

router.put("/web", async (req, res) => {
  const parsed = webPolicySchema.safeParse(req.body?.policy ?? req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid web policy payload.", formatZodError(parsed.error));
    return;
  }

  try {
    const saved = await saveWebPolicy(parsed.data);
    sendOk(res, { policy: saved });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to save web policy: ${error.message}`);
  }
});

router.get("/theme", async (_req, res) => {
  try {
    const theme = await getThemeSettings();
    sendOk(res, { theme });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to load theme: ${error.message}`);
  }
});

router.get("/models", async (_req, res) => {
  try {
    sendOk(res, {
      models: listModelCatalog(),
      imageGeneration: getImageGenerationStatus()
    });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to load model catalog: ${error.message}`);
  }
});

router.get("/agent-providers", async (_req, res) => {
  try {
    const registry = createAgentProviderRegistry();
    const [providers, agents] = await Promise.all([
      registry.listProviderStatuses(),
      registry.listAgents()
    ]);
    sendOk(res, { providers, agents });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to load agent providers: ${error.message}`);
  }
});

router.put("/theme", async (req, res) => {
  const theme = req.body?.theme ?? req.body;
  if (!theme || typeof theme !== "object") {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid theme payload.");
    return;
  }
  try {
    const saved = await saveThemeSettings(theme);
    sendOk(res, { theme: saved });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to save theme: ${error.message}`);
  }
});

router.post("/logo", upload.single("logo"), async (req, res) => {
  const file = req.file;
  if (!file) {
    sendError(res, 400, "VALIDATION_ERROR", "logo file is required.");
    return;
  }
  const ext = extFromUpload(file);
  if (!ext) {
    sendError(res, 400, "VALIDATION_ERROR", "Unsupported image type. Use png/jpg/jpeg/webp/gif/svg.");
    return;
  }
  try {
    await fs.mkdir(LOGO_DIR, { recursive: true });
    const existing = await fs.readdir(LOGO_DIR).catch(() => []);
    await Promise.all(existing.map((name) => fs.rm(path.join(LOGO_DIR, name), { force: true })));
    const filename = `logo${ext}`;
    await fs.writeFile(path.join(LOGO_DIR, filename), file.buffer);
    sendOk(res, { logoUrl: `/media/logo?t=${Date.now()}`, filename });
  } catch (error) {
    sendError(res, 500, "SERVER_ERROR", `Failed to save logo: ${error.message}`);
  }
});

export default router;
