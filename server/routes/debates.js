import express from "express";
import fs from "fs/promises";
import path from "path";
import {
  createDebateFiles,
  debatePath,
  getDebate,
  getPersona,
  listDebates,
  personaJsonPath,
  savePersona,
  updateDebateSession
} from "../../lib/storage.js";
import {
  adHocPersonaSchema,
  createDebateSchema,
  formatZodError,
  personaSchema
} from "../../lib/validators.js";
import { runDebate } from "../../lib/orchestrator.js";
import { sendError, sendOk } from "../response.js";
import { slugify, timestampForId } from "../../lib/utils.js";

const router = express.Router();
let runQueue = Promise.resolve();

async function resolveSelectedPersonas(selected) {
  const resolved = [];

  for (let i = 0; i < selected.length; i += 1) {
    const entry = selected[i];

    if (entry.type === "saved") {
      const persona = await getPersona(entry.id);
      resolved.push(persona);
      continue;
    }

    const adHocParsed = adHocPersonaSchema.safeParse(entry.persona);
    if (!adHocParsed.success) {
      const err = new Error("Invalid ad-hoc persona payload.");
      err.code = "VALIDATION_ERROR";
      err.details = formatZodError(adHocParsed.error);
      throw err;
    }

    const candidate = adHocParsed.data;
    const adHocId = candidate.id || `adhoc-${slugify(candidate.displayName)}-${i + 1}`;
    const persona = {
      ...candidate,
      id: adHocId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const parsedFull = personaSchema.safeParse(persona);
    if (!parsedFull.success) {
      const err = new Error("Invalid ad-hoc persona payload.");
      err.code = "VALIDATION_ERROR";
      err.details = formatZodError(parsedFull.error);
      throw err;
    }

    if (entry.savePersona) {
      try {
        await fs.access(personaJsonPath(persona.id));
        const err = new Error(`Persona id '${persona.id}' already exists.`);
        err.code = "DUPLICATE_ID";
        throw err;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      await savePersona(persona, { withMarkdown: true });
    }

    resolved.push(persona);
  }

  return resolved;
}

async function runDebateQueued(debateId) {
  runQueue = runQueue.then(async () => {
    try {
      const { session } = await getDebate(debateId);
      await runDebate({ debateId, session });
    } catch (error) {
      await updateDebateSession(debateId, (current) => ({
        ...current,
        status: "failed",
        error: {
          message: error.message,
          code: error.code || "DEBATE_RUN_ERROR"
        },
        progress: {
          round: current.progress?.round || 0,
          currentSpeaker: null,
          message: "Debate failed"
        }
      }));
    }
  });

  return runQueue;
}

router.post("/", async (req, res) => {
  const parsed = createDebateSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid debate payload.", formatZodError(parsed.error));
    return;
  }

  let personas;
  try {
    personas = await resolveSelectedPersonas(parsed.data.selectedPersonas);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", "One or more selected personas were not found.");
      return;
    }
    if (error.code === "INVALID_JSON") {
      sendError(res, 422, "CORRUPTED_PERSONA", "A selected persona has corrupted JSON.");
      return;
    }
    if (error.code === "VALIDATION_ERROR") {
      sendError(res, 400, "VALIDATION_ERROR", error.message, error.details);
      return;
    }
    if (error.code === "DUPLICATE_ID") {
      sendError(res, 409, "DUPLICATE_ID", error.message);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", "Failed to resolve selected personas.");
    return;
  }

  const stamp = timestampForId();
  const debateId = `${stamp}-${slugify(parsed.data.topic) || "debate"}`;

  const session = {
    debateId,
    topic: parsed.data.topic,
    context: parsed.data.context || "",
    settings: parsed.data.settings,
    personas,
    status: "queued",
    createdAt: new Date().toISOString(),
    progress: {
      round: 0,
      currentSpeaker: null,
      message: "Queued"
    },
    turns: []
  };

  await createDebateFiles(debateId, session);
  runDebateQueued(debateId);

  sendOk(
    res,
    {
      debateId,
      status: "queued",
      links: {
        self: `/api/debates/${debateId}`,
        transcript: `/api/debates/${debateId}/transcript`
      }
    },
    202
  );
});

router.get("/", async (_req, res) => {
  const debates = await listDebates();
  sendOk(res, { debates });
});

router.get("/:debateId", async (req, res) => {
  try {
    const { session, transcript } = await getDebate(req.params.debateId);
    sendOk(res, {
      session,
      transcript,
      links: {
        transcript: `/api/debates/${req.params.debateId}/transcript`,
        messages: path.join("data", "debates", req.params.debateId, "messages.jsonl")
      }
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Debate '${req.params.debateId}' not found.`);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", "Failed to load debate.");
  }
});

router.get("/:debateId/transcript", async (req, res) => {
  try {
    const filePath = path.join(debatePath(req.params.debateId), "transcript.md");
    const content = await fs.readFile(filePath, "utf8");
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${req.params.debateId}-transcript.md"`
    );
    res.send(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendError(res, 404, "NOT_FOUND", `Debate '${req.params.debateId}' transcript not found.`);
      return;
    }
    sendError(res, 500, "SERVER_ERROR", "Failed to read transcript.");
  }
});

export default router;
