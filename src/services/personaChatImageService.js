import { appendPersonaChatMessage, updatePersonaChatSession } from "../../lib/storage.js";
import { generateAndStoreImage } from "../../lib/images.js";
import { chooseResponders } from "../domain/personaChatResponderPolicy.js";

function buildSingleSpeakerOrchestrationEntry({ session, userEntry, leadPersona, reason, content }) {
  return {
    ts: new Date().toISOString(),
    role: "orchestrator",
    turnId: userEntry.turnId,
    selectedSpeakerIds: [leadPersona.id],
    omittedCount: Math.max(0, (session.personas || []).length - 1),
    rationale: [
      {
        speakerId: leadPersona.id,
        displayName: leadPersona.displayName,
        relevance: 1,
        outOfScope: false,
        reason
      }
    ],
    content
  };
}

function basePayload(userEntry, personaEntry, orchestrationEntry, shouldEmitOrchestration) {
  const payload = {
    user: userEntry,
    responses: [personaEntry]
  };
  if (shouldEmitOrchestration) {
    payload.orchestration = {
      selectedSpeakerIds: [personaEntry.speakerId],
      omittedCount: orchestrationEntry.omittedCount,
      rationale: orchestrationEntry.rationale,
      content: orchestrationEntry.content
    };
  }
  return payload;
}

async function appendAndUpdateForSinglePersona({
  chatId,
  shouldEmitOrchestration,
  orchestrationEntry,
  personaEntry,
  leadPersona
}) {
  if (shouldEmitOrchestration) {
    await appendPersonaChatMessage(chatId, orchestrationEntry);
  }
  await appendPersonaChatMessage(chatId, personaEntry);
  await updatePersonaChatSession(chatId, (current) => ({
    ...current,
    updatedAt: new Date().toISOString(),
    messageCount: Number(current.messageCount || 0) + (shouldEmitOrchestration ? 3 : 2),
    turnIndex: Number(current.turnIndex || 0) + 1,
    lastSpeakerIds: [leadPersona.id]
  }));
}

function chooseLeadPersona(session, history, userEntry) {
  const globalKnowledgePacks = Array.isArray(session.knowledgePacks) ? session.knowledgePacks : [];
  const orchestration = chooseResponders({
    personas: session.personas || [],
    knowledgeByPersona: session.knowledgeByPersona || {},
    globalKnowledgePacks,
    userMessage: userEntry.content,
    history,
    engagementMode: session.settings?.engagementMode || "chat"
  });
  const leadPersona = orchestration.selectedPersonas?.[0] || (session.personas || [])[0];
  return { orchestration, leadPersona };
}

export async function handlePersonaChatImageIntent({
  chatId,
  session,
  history,
  userEntry,
  imageIntent,
  shouldEmitOrchestration,
  authUser
}) {
  if (!imageIntent || imageIntent.mode === "none") {
    return { handled: false };
  }

  const { leadPersona } = chooseLeadPersona(session, history, userEntry);
  if (!leadPersona) {
    const err = new Error(
      imageIntent.mode === "clear"
        ? "No persona available to generate image."
        : "No persona available for clarification."
    );
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  if (imageIntent.mode === "ambiguous") {
    const orchestrationEntry = buildSingleSpeakerOrchestrationEntry({
      session,
      userEntry,
      leadPersona,
      reason: "Ambiguous image intent: route to a clarifying response.",
      content: `Orchestrator selected ${leadPersona.displayName} to clarify image request.`
    });
    const personaEntry = {
      ts: new Date().toISOString(),
      role: "persona",
      speakerId: leadPersona.id,
      displayName: leadPersona.displayName,
      content:
        "I can generate that visual. Please clarify what should be shown, desired style, and optional size (for example: 'diagram of microservice architecture, clean blueprint style, 1024x1024').",
      turnId: userEntry.turnId
    };
    await appendAndUpdateForSinglePersona({
      chatId,
      shouldEmitOrchestration,
      orchestrationEntry,
      personaEntry,
      leadPersona
    });
    return {
      handled: true,
      payload: basePayload(userEntry, personaEntry, orchestrationEntry, shouldEmitOrchestration)
    };
  }

  if (imageIntent.mode === "clear") {
    const orchestrationEntry = buildSingleSpeakerOrchestrationEntry({
      session,
      userEntry,
      leadPersona,
      reason: "Image request routed to lead persona for visual output.",
      content: `Orchestrator selected ${leadPersona.displayName} for image generation.`
    });
    const styledPrompt = [
      `Visual style from persona ${leadPersona.displayName}${leadPersona.role ? ` (${leadPersona.role})` : ""}.`,
      `Persona traits: ${(leadPersona.expertiseTags || []).join(", ") || "general"}.`,
      `User request: ${imageIntent.prompt}`
    ].join("\n");
    const image = await generateAndStoreImage({
      prompt: styledPrompt,
      user: authUser || null,
      contextType: "persona-chat",
      contextId: chatId
    });
    const personaEntry = {
      ts: new Date().toISOString(),
      role: "persona",
      speakerId: leadPersona.id,
      displayName: leadPersona.displayName,
      content: `Generated image based on your request: ${imageIntent.prompt}`,
      image,
      turnId: userEntry.turnId
    };
    await appendAndUpdateForSinglePersona({
      chatId,
      shouldEmitOrchestration,
      orchestrationEntry,
      personaEntry,
      leadPersona
    });
    return {
      handled: true,
      payload: basePayload(userEntry, personaEntry, orchestrationEntry, shouldEmitOrchestration)
    };
  }

  return { handled: false };
}

