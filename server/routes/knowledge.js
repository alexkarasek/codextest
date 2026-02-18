import express from "express";
import { z } from "zod";
import multer from "multer";
import {
  getKnowledgePack,
  knowledgePackPath,
  listKnowledgePacks,
  saveKnowledgePack
} from "../../lib/storage.js";
import { formatZodError, knowledgePackSchema } from "../../lib/validators.js";
import { sendError, sendOk } from "../response.js";
import fs from "fs/promises";
import { ingestFileToKnowledgePack, ingestUrlToKnowledgePack } from "../../lib/knowledgeIngest.js";
import { fetchWebDocument, truncateWebText } from "../../lib/webFetch.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

router.get("/", async (_req, res) => {
  const data = await listKnowledgePacks();
  sendOk(res, data);
});

router.get("/:id", async (req, res) => {
  try {
    const pack = await getKnowledgePack(req.params.id);
    if (pack?.isHidden) {
      sendError(res, 404, "NOT_FOUND", `Knowledge pack '${req.params.id}' not found.`);
      return;
    }
    sendOk(res, { pack });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Knowledge pack '${req.params.id}' not found.`);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", "Failed to load knowledge pack.");
  }
});

router.post("/", async (req, res) => {
  const parsed = knowledgePackSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid knowledge pack payload.", formatZodError(parsed.error));
    return;
  }

  const pack = {
    ...parsed.data,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await fs.access(knowledgePackPath(pack.id));
    sendError(res, 409, "DUPLICATE_ID", `Knowledge pack id '${pack.id}' already exists.`);
    return;
  } catch {
    // expected when missing
  }

  await saveKnowledgePack(pack);
  sendOk(res, { pack }, 201);
});

router.put("/:id", async (req, res) => {
  const parsed = knowledgePackSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid knowledge pack payload.", formatZodError(parsed.error));
    return;
  }
  if (parsed.data.id !== req.params.id) {
    sendError(res, 400, "ID_MISMATCH", "Path id and payload id must match.");
    return;
  }

  try {
    const existing = await getKnowledgePack(req.params.id);
    if (existing?.isHidden) {
      sendError(res, 403, "FORBIDDEN", "Hidden knowledge packs cannot be modified via this endpoint.");
      return;
    }
    const pack = {
      ...parsed.data,
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await saveKnowledgePack(pack);
    sendOk(res, { pack });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Knowledge pack '${req.params.id}' not found.`);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", "Failed to update knowledge pack.");
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const existing = await getKnowledgePack(req.params.id);
    if (existing?.isHidden) {
      sendError(res, 403, "FORBIDDEN", "Hidden knowledge packs cannot be deleted via this endpoint.");
      return;
    }
    await fs.rm(knowledgePackPath(req.params.id), { force: true });
    sendOk(res, { deleted: req.params.id });
  } catch {
    sendError(res, 500, "SERVER_ERROR", "Failed to delete knowledge pack.");
  }
});

router.post("/ingest", upload.single("file"), async (req, res) => {
  try {
    const { pack, ingestMeta } = await ingestFileToKnowledgePack({
      file: req.file,
      id: req.body?.id,
      title: req.body?.title,
      description: req.body?.description,
      tags: req.body?.tags
    });

    const parsed = knowledgePackSchema.safeParse(pack);
    if (!parsed.success) {
      sendError(
        res,
        400,
        "VALIDATION_ERROR",
        "Generated knowledge pack did not pass schema validation.",
        formatZodError(parsed.error)
      );
      return;
    }

    try {
      await fs.access(knowledgePackPath(pack.id));
      sendError(res, 409, "DUPLICATE_ID", `Knowledge pack id '${pack.id}' already exists.`);
      return;
    } catch {
      // expected
    }

    await saveKnowledgePack(pack);
    sendOk(res, { pack, ingestMeta }, 201);
  } catch (error) {
    if (error.code === "LIMIT_FILE_SIZE") {
      sendError(res, 400, "FILE_TOO_LARGE", "File exceeds 15MB upload limit.");
      return;
    }
    if (error.code === "MISSING_API_KEY") {
      sendError(
        res,
        400,
        "MISSING_API_KEY",
        "LLM provider credentials are required for image OCR ingestion."
      );
      return;
    }
    if (error.code === "UNSUPPORTED_FILE_TYPE") {
      sendError(res, 400, "UNSUPPORTED_FILE_TYPE", error.message);
      return;
    }
    sendError(res, 500, "INGEST_FAILED", `Knowledge ingest failed: ${error.message}`);
  }
});

router.post("/ingest-url", async (req, res) => {
  const url = String(req.body?.url || "").trim();
  const mode = String(req.body?.mode || "create").trim();
  const summarize = req.body?.summarize !== false;

  if (!url) {
    sendError(res, 400, "VALIDATION_ERROR", "url is required.");
    return;
  }

  try {
    const { pack, ingestMeta } = await ingestUrlToKnowledgePack({
      url,
      id: req.body?.id,
      title: req.body?.title,
      description: req.body?.description,
      tags: req.body?.tags,
      summarize
    });

    if (mode === "append") {
      const existing = await getKnowledgePack(pack.id);
      if (existing?.isHidden) {
        sendError(res, 403, "FORBIDDEN", "Hidden knowledge packs cannot be modified via this endpoint.");
        return;
      }
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
      sendOk(res, { pack: merged, ingestMeta }, 200);
      return;
    }

    try {
      await fs.access(knowledgePackPath(pack.id));
      sendError(res, 409, "DUPLICATE_ID", `Knowledge pack id '${pack.id}' already exists.`);
      return;
    } catch {
      // expected
    }

    await saveKnowledgePack(pack);
    sendOk(res, { pack, ingestMeta }, 201);
  } catch (error) {
    if (error.code === "MISSING_API_KEY") {
      sendError(res, 400, "MISSING_API_KEY", "LLM provider credentials are required for summarization.");
      return;
    }
    if (error.code === "BLOCKED_HOSTNAME") {
      sendError(res, 400, "BLOCKED_HOSTNAME", error.message);
      return;
    }
    if (error.code === "BLOCKED_DOMAIN") {
      sendError(res, 400, "BLOCKED_DOMAIN", error.message, error.details || null);
      return;
    }
    if (error.code === "FETCH_TOO_LARGE") {
      sendError(res, 400, "FETCH_TOO_LARGE", error.message);
      return;
    }
    if (error.code === "FETCH_FAILED") {
      sendError(res, 400, "FETCH_FAILED", error.message);
      return;
    }
    sendError(res, 500, "INGEST_FAILED", `URL ingest failed: ${error.message}`);
  }
});

router.post("/preview-url", async (req, res) => {
  const url = String(req.body?.url || "").trim();
  const maxChars = Number(req.body?.maxChars);
  if (!url) {
    sendError(res, 400, "VALIDATION_ERROR", "url is required.");
    return;
  }

  try {
    const doc = await fetchWebDocument(url);
    const text = truncateWebText(doc.text || "", maxChars || 4000);
    sendOk(res, {
      preview: {
        url: doc.url,
        title: doc.title,
        contentType: doc.contentType,
        retrievedAt: doc.retrievedAt,
        text
      }
    });
  } catch (error) {
    if (error.code === "BLOCKED_HOSTNAME") {
      sendError(res, 400, "BLOCKED_HOSTNAME", error.message);
      return;
    }
    if (error.code === "BLOCKED_DOMAIN") {
      sendError(res, 400, "BLOCKED_DOMAIN", error.message, error.details || null);
      return;
    }
    if (error.code === "FETCH_TOO_LARGE") {
      sendError(res, 400, "FETCH_TOO_LARGE", error.message);
      return;
    }
    if (error.code === "FETCH_FAILED") {
      sendError(res, 400, "FETCH_FAILED", error.message);
      return;
    }
    sendError(res, 500, "PREVIEW_FAILED", `URL preview failed: ${error.message}`);
  }
});

export default router;
