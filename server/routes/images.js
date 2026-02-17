import express from "express";
import fs from "fs/promises";
import { generateAndStoreImage, getImageBinaryPath } from "../../lib/images.js";
import { sendError, sendOk } from "../response.js";

const router = express.Router();

router.post("/generate", async (req, res) => {
  const prompt = String(req.body?.prompt || "").trim();
  if (!prompt) {
    sendError(res, 400, "VALIDATION_ERROR", "prompt is required.");
    return;
  }

  try {
    const image = await generateAndStoreImage({
      prompt,
      model: String(req.body?.model || "gpt-image-1"),
      size: String(req.body?.size || "1024x1024"),
      quality: String(req.body?.quality || "auto"),
      user: req.auth?.user || null,
      contextType: String(req.body?.contextType || "direct"),
      contextId: String(req.body?.contextId || "")
    });
    sendOk(res, { image }, 201);
  } catch (error) {
    if (error.code === "MISSING_API_KEY") {
      sendError(res, 400, "MISSING_API_KEY", "LLM provider credentials are not configured.");
      return;
    }
    if (error.code === "UNSUPPORTED_PROVIDER") {
      sendError(res, 400, "UNSUPPORTED_PROVIDER", error.message);
      return;
    }
    if (error.code === "VALIDATION_ERROR") {
      sendError(res, 400, "VALIDATION_ERROR", error.message);
      return;
    }
    sendError(res, 502, "IMAGE_ERROR", `Image generation failed: ${error.message}`);
  }
});

router.get("/:imageId", async (req, res) => {
  try {
    const data = await getImageBinaryPath(req.params.imageId);
    await fs.access(data.absolutePath);
    res.setHeader("Content-Type", data.meta?.mimeType || "image/png");
    res.sendFile(data.absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Image '${req.params.imageId}' not found.`);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", `Failed to load image: ${error.message}`);
  }
});

export default router;
