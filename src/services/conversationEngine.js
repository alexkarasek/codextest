import { runDebate } from "../../lib/orchestrator.js";

export async function runConversationSession({ conversationMode, conversationId, session }) {
  const mode = String(conversationMode || "").trim().toLowerCase();
  if (mode === "debate") {
    await runDebate({ debateId: conversationId, session });
    return;
  }

  const err = new Error(`Unsupported conversation mode '${conversationMode}'.`);
  err.code = "UNSUPPORTED_CONVERSATION_MODE";
  throw err;
}
