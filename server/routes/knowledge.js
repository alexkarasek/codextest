import express from "express";
import { z } from "zod";
import multer from "multer";
import {
  archiveKnowledgePack,
  getKnowledgePack,
  hardDeleteKnowledgePack,
  knowledgePackPath,
  listKnowledgePacks,
  saveKnowledgePack
} from "../../lib/storage.js";
import { formatZodError, knowledgePackSchema } from "../../lib/validators.js";
import { sendError, sendOk } from "../response.js";
import { sendMappedError } from "../errorMapper.js";
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
    if (pack?.isHidden || pack?.isArchived) {
      sendError(res, 404, "NOT_FOUND", `Knowledge pack '${req.params.id}' not found.`);
      return;
    }
    sendOk(res, { pack });
  } catch (error) {
    sendMappedError(
      res,
      error,
      [{ matchCode: "ENOENT", code: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Knowledge pack '${req.params.id}' not found.` }],
      { status: 500, code: "SERVER_ERROR", message: "Failed to load knowledge pack." }
    );
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
    if (existing?.isHidden || existing?.isArchived) {
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
    sendMappedError(
      res,
      error,
      [{ matchCode: "ENOENT", code: "ENOENT", status: 404, responseCode: "NOT_FOUND", message: `Knowledge pack '${req.params.id}' not found.` }],
      { status: 500, code: "SERVER_ERROR", message: "Failed to update knowledge pack." }
    );
  }
});

router.delete("/:id", async (req, res) => {
  const mode = String(req.query.mode || "archive").trim().toLowerCase();
  if (!["archive", "hard"].includes(mode)) {
    sendError(res, 400, "VALIDATION_ERROR", "mode must be 'archive' or 'hard'.");
    return;
  }
  if (mode === "hard" && req.auth?.user?.role !== "admin") {
    sendError(res, 403, "FORBIDDEN", "Hard delete requires admin role.");
    return;
  }
  try {
    const existing = await getKnowledgePack(req.params.id);
    if (existing?.isHidden) {
      sendError(res, 403, "FORBIDDEN", "Hidden knowledge packs cannot be deleted via this endpoint.");
      return;
    }
    if (mode === "hard") {
      await hardDeleteKnowledgePack(req.params.id, {
        actor: req.auth?.user || null,
        reason: String(req.body?.reason || "")
      });
    } else {
      await archiveKnowledgePack(req.params.id, {
        actor: req.auth?.user || null,
        reason: String(req.body?.reason || "")
      });
    }
    sendOk(res, { deleted: req.params.id, mode });
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
    sendMappedError(
      res,
      error,
      [
        { code: "LIMIT_FILE_SIZE", status: 400, responseCode: "FILE_TOO_LARGE", message: "File exceeds 15MB upload limit." },
        { code: "MISSING_API_KEY", status: 400, message: "LLM provider credentials are required for image OCR ingestion." },
        { code: "UNSUPPORTED_FILE_TYPE", status: 400 }
      ],
      { status: 500, code: "INGEST_FAILED", message: (e) => `Knowledge ingest failed: ${e.message}` }
    );
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
      if (existing?.isHidden || existing?.isArchived) {
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
    sendMappedError(
      res,
      error,
      [
        { code: "MISSING_API_KEY", status: 400, message: "LLM provider credentials are required for summarization." },
        { code: "BLOCKED_HOSTNAME", status: 400 },
        { code: "BLOCKED_DOMAIN", status: 400, details: (e) => e.details || null },
        { code: "FETCH_TOO_LARGE", status: 400 },
        { code: "FETCH_FAILED", status: 400 }
      ],
      { status: 500, code: "INGEST_FAILED", message: (e) => `URL ingest failed: ${e.message}` }
    );
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
    sendMappedError(
      res,
      error,
      [
        { code: "BLOCKED_HOSTNAME", status: 400 },
        { code: "BLOCKED_DOMAIN", status: 400, details: (e) => e.details || null },
        { code: "FETCH_TOO_LARGE", status: 400 },
        { code: "FETCH_FAILED", status: 400 }
      ],
      { status: 500, code: "PREVIEW_FAILED", message: (e) => `URL preview failed: ${e.message}` }
    );
  }
});

export default router;
