import express from "express";
import {
  createPersonaChatSchema,
  formatZodError,
  personaChatMessageSchema
} from "../../lib/validators.js";
import { sendError, sendOk } from "../response.js";
import { processPersonaChatMessage } from "../../src/services/personaChatMessageService.js";
import {
  createPersonaChatSession,
  getPersonaChatSessionDetail,
  listPersonaChatSessions
} from "../../src/services/personaChatSessionService.js";
import { sendMappedError } from "../errorMapper.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const parsed = createPersonaChatSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid persona chat payload.", formatZodError(parsed.error));
    return;
  }

  let created;
  try {
    created = await createPersonaChatSession({
      payload: parsed.data,
      authUser: req.auth?.user || null
    });
  } catch (error) {
    sendMappedError(
      res,
      error,
      [
        { code: "NOT_FOUND", status: 404 },
        { code: "CORRUPTED_PERSONA", status: 422 },
        { code: "VALIDATION_ERROR", status: 400, details: (e) => e.details },
        { code: "DUPLICATE_ID", status: 409 }
      ],
      { status: 500, code: "SERVER_ERROR", message: "Failed to create persona chat." }
    );
    return;
  }

  sendOk(
    res,
    {
      chatId: created.chatId,
      session: created.session,
      links: {
        self: `/api/persona-chats/${created.chatId}`,
        messages: `/api/persona-chats/${created.chatId}/messages`
      }
    },
    201
  );
});

router.get("/", async (_req, res) => {
  try {
    const payload = await listPersonaChatSessions();
    sendOk(res, payload);
  } catch (_error) {
    sendError(res, 500, "SERVER_ERROR", "Failed to list persona chats.");
  }
});

router.get("/:chatId", async (req, res) => {
  try {
    const payload = await getPersonaChatSessionDetail(req.params.chatId);
    sendOk(res, payload);
  } catch (error) {
    sendMappedError(
      res,
      error,
      [{ code: "NOT_FOUND", status: 404 }],
      { status: 500, code: "SERVER_ERROR", message: "Failed to load persona chat." }
    );
  }
});

router.post("/:chatId/messages", async (req, res) => {
  const parsed = personaChatMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "VALIDATION_ERROR", "Invalid chat message payload.", formatZodError(parsed.error));
    return;
  }

  try {
    const payload = await processPersonaChatMessage({
      chatId: req.params.chatId,
      body: parsed.data,
      authUser: req.auth?.user || null
    });
    sendOk(res, payload);
  } catch (error) {
    sendMappedError(
      res,
      error,
      [
        { code: "NOT_FOUND", status: 404 },
        { code: "VALIDATION_ERROR", status: 400 },
        { code: "MISSING_API_KEY", status: 400 },
        { code: "UNSUPPORTED_PROVIDER", status: 400 },
        { code: "IMAGE_ERROR", status: 502 },
        { code: "LLM_ERROR", status: 502 },
        { code: "LOAD_FAILED", status: 500 }
      ],
      { status: 500, code: "SERVER_ERROR", message: "Persona chat failed." }
    );
    return;
  }
});

export default router;
