import { getPersonaChat, listPersonaChatMessages, listPersonaChats } from "../../lib/storage.js";
import { createConversationSession } from "./createConversationSession.js";

function createError(code, message, details = undefined) {
  const error = new Error(message);
  error.code = code;
  if (typeof details !== "undefined") error.details = details;
  return error;
}

export async function createPersonaChatSession({ payload, authUser }) {
  try {
    const created = await createConversationSession({
      kind: "persona-chat",
      payload,
      user: authUser || null
    });
    return {
      chatId: created.conversationId,
      session: created.session
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      throw createError("NOT_FOUND", "One or more selected personas or knowledge packs were not found.");
    }
    if (error.code === "INVALID_JSON") {
      throw createError("CORRUPTED_PERSONA", "A selected persona has corrupted JSON.");
    }
    if (error.code === "VALIDATION_ERROR") {
      throw createError("VALIDATION_ERROR", error.message, error.details);
    }
    if (error.code === "DUPLICATE_ID") {
      throw createError("DUPLICATE_ID", error.message);
    }
    throw createError("CREATE_FAILED", "Failed to create persona chat.");
  }
}

export async function listPersonaChatSessions() {
  try {
    const chats = await listPersonaChats();
    return { chats };
  } catch (_error) {
    throw createError("LIST_FAILED", "Failed to list persona chats.");
  }
}

export async function getPersonaChatSessionDetail(chatId) {
  try {
    const { session } = await getPersonaChat(chatId);
    const messages = await listPersonaChatMessages(chatId);
    return { session, messages };
  } catch (error) {
    if (error.code === "ENOENT") {
      throw createError("NOT_FOUND", `Persona chat '${chatId}' not found.`);
    }
    throw createError("LOAD_FAILED", "Failed to load persona chat.");
  }
}
