import fs from "fs/promises";
import path from "path";
import { imageGeneration } from "./llm.js";
import { IMAGES_DIR, ensureDataDirs, readJsonFile, writeJsonFile } from "./storage.js";
import { slugify, timestampForId, truncateText } from "./utils.js";

function imageIdFromPrompt(prompt) {
  return `${timestampForId()}-${slugify(truncateText(prompt, 40)) || "image"}-${Math.random().toString(36).slice(2, 7)}`;
}

function metaPath(imageId) {
  return path.join(IMAGES_DIR, `${imageId}.json`);
}

function filePath(imageId) {
  return path.join(IMAGES_DIR, `${imageId}.png`);
}

export async function generateAndStoreImage({
  prompt,
  model = "gpt-image-1",
  size = "1024x1024",
  quality = "auto",
  user = null,
  contextType = "chat",
  contextId = ""
}) {
  await ensureDataDirs();
  const safePrompt = String(prompt || "").trim();
  if (!safePrompt) {
    const err = new Error("Image prompt is required.");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const generated = await imageGeneration({
    model,
    prompt: safePrompt,
    size,
    quality
  });

  const b64 = String(generated.b64 || "").trim();
  if (!b64) {
    const err = new Error("Image API returned no image bytes.");
    err.code = "IMAGE_EMPTY";
    throw err;
  }

  const id = imageIdFromPrompt(safePrompt);
  const imageFile = filePath(id);
  const metaFile = metaPath(id);
  const buffer = Buffer.from(b64, "base64");
  await fs.writeFile(imageFile, buffer);

  const meta = {
    id,
    prompt: safePrompt,
    revisedPrompt: generated.revisedPrompt || "",
    model,
    size,
    quality,
    mimeType: "image/png",
    fileName: path.basename(imageFile),
    createdAt: new Date().toISOString(),
    createdBy: user?.id || null,
    createdByUsername: user?.username || null,
    contextType: String(contextType || "chat"),
    contextId: String(contextId || "")
  };

  await writeJsonFile(metaFile, meta);

  return {
    ...meta,
    bytes: buffer.byteLength,
    url: `/api/images/${encodeURIComponent(id)}`,
    filePath: path.relative(process.cwd(), imageFile)
  };
}

export async function getImageMeta(imageId) {
  return readJsonFile(metaPath(imageId));
}

export async function getImageBinaryPath(imageId) {
  const meta = await getImageMeta(imageId);
  return {
    meta,
    absolutePath: path.join(IMAGES_DIR, meta.fileName)
  };
}
