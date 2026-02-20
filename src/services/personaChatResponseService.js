import { buildOrchestrationContent } from "../domain/personaChatResponderPolicy.js";

export function buildMainOrchestrationEntry({ orchestration, mode, turnId }) {
  return {
    ts: new Date().toISOString(),
    role: "orchestrator",
    turnId,
    selectedSpeakerIds: (orchestration?.rationale || []).map((r) => r.speakerId),
    omittedCount: Number(orchestration?.omittedCount || 0),
    rationale: Array.isArray(orchestration?.rationale) ? orchestration.rationale : [],
    content: buildOrchestrationContent(orchestration || { rationale: [], omittedCount: 0 }, mode || "chat")
  };
}

export function buildPersonaChatTurnResponsePayload({
  userEntry,
  responses,
  shouldEmitOrchestration,
  orchestration,
  orchestrationEntry
}) {
  const payload = {
    user: userEntry,
    responses: Array.isArray(responses) ? responses : []
  };
  if (shouldEmitOrchestration) {
    payload.orchestration = {
      selectedSpeakerIds: (orchestration?.rationale || []).map((r) => r.speakerId),
      omittedCount: Number(orchestration?.omittedCount || 0),
      rationale: Array.isArray(orchestration?.rationale) ? orchestration.rationale : [],
      content: String(orchestrationEntry?.content || "")
    };
  }
  return payload;
}

