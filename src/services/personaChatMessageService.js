import {
  appendPersonaChatMessage,
  getPersonaChat,
  listPersonaChatMessages
} from "../../lib/storage.js";
import { detectImageIntent } from "../domain/personaChatPromptPolicy.js";
import { chooseResponders } from "../domain/personaChatResponderPolicy.js";
import { handlePersonaChatImageIntent } from "./personaChatImageService.js";
import { buildMainOrchestrationEntry, buildPersonaChatTurnResponsePayload } from "./personaChatResponseService.js";
import { executePersonaChatTurn } from "./personaChatTurnService.js";

function createError(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (typeof details !== "undefined") error.details = details;
  return error;
}

export async function processPersonaChatMessage({
  chatId,
  body,
  authUser
}) {
  let session;
  let history;
  try {
    const data = await getPersonaChat(chatId);
    session = data.session;
    if (session?.isArchived) {
      throw createError("NOT_FOUND", `Persona chat '${chatId}' not found.`);
    }
    history = await listPersonaChatMessages(chatId);
  } catch (error) {
    if (error.code === "NOT_FOUND") {
      throw error;
    }
    if (error.code === "ENOENT") {
      throw createError("NOT_FOUND", `Persona chat '${chatId}' not found.`);
    }
    throw createError("LOAD_FAILED", "Failed to load persona chat.");
  }

  const userEntry = {
    ts: new Date().toISOString(),
    role: "user",
    content: String(body?.message || "").trim(),
    turnId: Number(session.turnIndex || 0) + 1
  };
  await appendPersonaChatMessage(chatId, userEntry);
  const shouldEmitOrchestration = Array.isArray(session.personas) && session.personas.length > 1;

  const imageIntent = detectImageIntent(userEntry.content, {
    force: Boolean(body?.forceImage)
  });
  try {
    const imageResult = await handlePersonaChatImageIntent({
      chatId,
      session,
      history,
      userEntry,
      imageIntent,
      shouldEmitOrchestration,
      authUser: authUser || null
    });
    if (imageResult?.handled) {
      return imageResult.payload;
    }
  } catch (error) {
    if (error.code === "VALIDATION_ERROR") {
      throw createError("VALIDATION_ERROR", error.message);
    }
    if (error.code === "MISSING_API_KEY") {
      throw createError("MISSING_API_KEY", "LLM provider credentials are not configured.");
    }
    if (error.code === "UNSUPPORTED_PROVIDER") {
      throw createError("UNSUPPORTED_PROVIDER", error.message);
    }
    throw createError("IMAGE_ERROR", `Image generation failed: ${error.message}`);
  }

  const globalKnowledgePacks = Array.isArray(session.knowledgePacks) ? session.knowledgePacks : [];
  const orchestration = chooseResponders({
    personas: session.personas || [],
    knowledgeByPersona: session.knowledgeByPersona || {},
    globalKnowledgePacks,
    userMessage: userEntry.content,
    history,
    engagementMode: session.settings?.engagementMode || "chat"
  });
  const orchestrationEntry = buildMainOrchestrationEntry({
    orchestration,
    mode: session.settings?.engagementMode || "chat",
    turnId: userEntry.turnId
  });
  if (shouldEmitOrchestration) {
    await appendPersonaChatMessage(chatId, orchestrationEntry);
  }

  let execution;
  try {
    execution = await executePersonaChatTurn({
      chatId,
      session,
      history,
      userEntry,
      historyLimit: body?.historyLimit,
      orchestration,
      shouldEmitOrchestration,
      authUser: authUser || null
    });
  } catch (error) {
    if (error.code === "MISSING_API_KEY") {
      throw createError("MISSING_API_KEY", "LLM provider credentials are not configured.");
    }
    throw createError("LLM_ERROR", `Persona chat failed: ${error.message}`);
  }

  return buildPersonaChatTurnResponsePayload({
    userEntry,
    responses: execution?.newTurnMessages || [],
    shouldEmitOrchestration,
    orchestration,
    orchestrationEntry
  });
}
