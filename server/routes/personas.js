import express from "express";
import fs from "fs/promises";
import {
  deletePersona,
  getPersona,
  listPersonas,
  personaJsonPath,
  savePersona
} from "../../lib/storage.js";
import { formatZodError, personaSchema } from "../../lib/validators.js";
import { sendError, sendOk } from "../response.js";
import { optimizePersonaForDebate } from "../../lib/personaOptimizer.js";

const router = express.Router();

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
    ...parsed.data,
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

  let finalPersona = basePersona;
  let optimization = {
    applied: false,
    message: "Saved without optimization."
  };

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
    optimization = {
      applied: false,
      message: `Saved without optimization: ${error.message}`
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
      ...parsed.data,
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

export default router;
