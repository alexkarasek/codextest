import express from "express";
import fs from "fs/promises";
import { z } from "zod";
import {
  deletePersona,
  getPersona,
  listPersonas,
  personaJsonPath,
  savePersona
} from "../../lib/storage.js";
import { formatZodError, personaSchema, topicSourceSchema } from "../../lib/validators.js";
import { sendError, sendOk } from "../response.js";
import { optimizePersonaForDebate } from "../../lib/personaOptimizer.js";
import { generatePersonasFromTopic } from "../../lib/personaGenerator.js";

const router = express.Router();
const generateFromTopicSchema = z.object({
  topic: z.string().min(2, "topic is required"),
  context: z.string().optional().default(""),
  count: z
    .preprocess((v) => {
      if (v === undefined || v === null || v === "") return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }, z.number().int().min(1).max(6))
    .optional()
    .default(3),
  model: z.string().optional().default("gpt-4.1-mini"),
  sources: z.array(topicSourceSchema).optional().default([])
});

function inferDescriptionFromPrompt(systemPrompt) {
  const text = String(systemPrompt || "").trim();
  if (!text) return "";
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const firstSentence = String(firstLine || text).split(/[.!?]/)[0].trim();
  return firstSentence.slice(0, 220);
}

function inferVerbosity(systemPrompt) {
  const low = String(systemPrompt || "").toLowerCase();
  if (/\b(very concise|brief|short)\b/.test(low)) return "concise";
  if (/\b(verbose|detailed|long-form)\b/.test(low)) return "detailed";
  return "";
}

function inferTone(systemPrompt) {
  const low = String(systemPrompt || "").toLowerCase();
  if (/\b(friendly|warm|empathetic)\b/.test(low)) return "friendly";
  if (/\b(formal|professional)\b/.test(low)) return "formal";
  if (/\b(direct|blunt)\b/.test(low)) return "direct";
  return "";
}

function hydratePersonaFromPrompt(persona) {
  const systemPrompt = String(persona.systemPrompt || "").trim();
  const description = String(persona.description || "").trim() || inferDescriptionFromPrompt(systemPrompt);
  const speakingStyle = persona.speakingStyle || {};
  const hydrated = {
    ...persona,
    description,
    speakingStyle: {
      tone: String(speakingStyle.tone || "").trim() || inferTone(systemPrompt),
      verbosity: String(speakingStyle.verbosity || "").trim() || inferVerbosity(systemPrompt),
      quirks: Array.isArray(speakingStyle.quirks) ? speakingStyle.quirks : []
    },
    debateBehavior: String(persona.debateBehavior || "").trim()
  };
  return hydrated;
}

router.get("/", async (req, res) => {
  const q = String(req.query.q || "").toLowerCase().trim();
  const tag = String(req.query.tag || "").toLowerCase().trim();

  const { personas, errors } = await listPersonas();
  const filtered = personas.filter((persona) => {
    const matchesQ =
      !q ||
      persona.id.toLowerCase().includes(q) ||
      persona.displayName.toLowerCase().includes(q) ||
      (persona.description || "").toLowerCase().includes(q);

    const matchesTag =
      !tag ||
      (persona.expertiseTags || []).some((item) => String(item).toLowerCase() === tag);

    return matchesQ && matchesTag;
  });

  sendOk(res, { personas: filtered, errors });
});

router.get("/:id", async (req, res) => {
  try {
    const persona = await getPersona(req.params.id);
    sendOk(res, { persona });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Persona '${req.params.id}' not found.`);
      return;
    }
    if (error.code === "INVALID_JSON") {
      sendError(res, 422, "CORRUPTED_PERSONA", error.message);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", "Failed to load persona.");
  }
});

router.post("/", async (req, res) => {
  const parsed = personaSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid persona payload.", formatZodError(parsed.error));
    return;
  }

  const basePersona = {
    ...hydratePersonaFromPrompt(parsed.data),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  try {
    await fs.access(personaJsonPath(basePersona.id));
    sendError(res, 409, "DUPLICATE_ID", `Persona id '${basePersona.id}' already exists.`);
    return;
  } catch {
    // expected when not found
  }

  let finalPersona;
  let optimization;
  try {
    const { personas: existingPersonas } = await listPersonas();
    const optimized = await optimizePersonaForDebate({
      persona: basePersona,
      existingPersonas
    });
    finalPersona = {
      ...optimized.persona,
      id: basePersona.id,
      createdAt: basePersona.createdAt,
      updatedAt: new Date().toISOString()
    };
    optimization = optimized.optimization;
  } catch (error) {
    finalPersona = basePersona;
    optimization = {
      applied: false,
      strictRewrite: false,
      changedFields: 0,
      fallback: true,
      warning: true,
      message: `Persona saved without optimization: ${error.message}`
    };
  }

  await savePersona(finalPersona, { withMarkdown: true });
  sendOk(res, { persona: finalPersona, optimization }, 201);
});

router.put("/:id", async (req, res) => {
  const parsed = personaSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid persona payload.", formatZodError(parsed.error));
    return;
  }

  if (parsed.data.id !== req.params.id) {
    sendError(res, 400, "ID_MISMATCH", "Path id and payload id must match.");
    return;
  }

  try {
    const existing = await getPersona(req.params.id);
    const persona = {
      ...hydratePersonaFromPrompt(parsed.data),
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await savePersona(persona, { withMarkdown: true });
    sendOk(res, { persona });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Persona '${req.params.id}' not found.`);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", "Failed to update persona.");
  }
});

router.post("/:id/duplicate", async (req, res) => {
  const newId = String(req.body?.id || "").trim();
  if (!newId) {
    sendError(res, 400, "VALIDATION_ERROR", "New id is required.");
    return;
  }

  try {
    const source = await getPersona(req.params.id);
    const persona = {
      ...source,
      id: newId,
      displayName: req.body?.displayName || `${source.displayName} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const parsed = personaSchema.safeParse(persona);
    if (!parsed.success) {
      sendError(res, 400, "VALIDATION_ERROR", "Invalid duplicated persona payload.", formatZodError(parsed.error));
      return;
    }

    try {
      await fs.access(personaJsonPath(newId));
      sendError(res, 409, "DUPLICATE_ID", `Persona id '${newId}' already exists.`);
      return;
    } catch {
      // expected when not found
    }

    await savePersona(persona, { withMarkdown: true });
    sendOk(res, { persona }, 201);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Persona '${req.params.id}' not found.`);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", "Failed to duplicate persona.");
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await deletePersona(req.params.id);
    sendOk(res, { deleted: req.params.id });
  } catch {
    sendError(res, 500, "SERVER_ERROR", "Failed to delete persona.");
  }
});

router.post("/generate-from-topic", async (req, res) => {
  const parsed = generateFromTopicSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(
      res,
      400,
      "VALIDATION_ERROR",
      "Invalid generate-from-topic payload.",
      formatZodError(parsed.error)
    );
    return;
  }

  try {
    const drafts = await generatePersonasFromTopic(parsed.data);
    sendOk(res, {
      topic: parsed.data.topic,
      drafts
    });
  } catch (error) {
    if (error.code === "MISSING_API_KEY") {
      sendError(res, 400, "MISSING_API_KEY", "OpenAI API key is not configured.");
      return;
    }
    sendError(
      res,
      502,
      "PERSONA_GENERATION_FAILED",
      `Failed to generate personas from topic: ${error.message}`
    );
  }
});

export default router;
