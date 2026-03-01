import { appendPersonaChatMessage, updatePersonaChatSession } from "../../lib/storage.js";
import { generateAndStoreImage } from "../../lib/images.js";

const IMAGE_AGENT = {
  id: "image-concierge",
  displayName: "Image Concierge"
};

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

export async function handlePersonaChatImageIntent({
  chatId,
  session,
  userEntry,
  imageIntent,
  shouldEmitOrchestration,
  authUser
}) {
  if (!imageIntent || imageIntent.mode === "none") {
    return { handled: false };
  }

  if (imageIntent.mode === "ambiguous") {
    const orchestrationEntry = buildSingleSpeakerOrchestrationEntry({
      session,
      userEntry,
      leadPersona: IMAGE_AGENT,
      reason: "Image request routed to hidden image specialist for clarification.",
      content: "Image Concierge is asking for one clarification before generating the visual."
    });
    const personaEntry = {
      ts: new Date().toISOString(),
      role: "persona",
      speakerId: IMAGE_AGENT.id,
      displayName: IMAGE_AGENT.displayName,
      content:
        "I can generate that visual. Please clarify what should be shown, desired style, and optional size (for example: 'diagram of microservice architecture, clean blueprint style, 1024x1024').",
      turnId: userEntry.turnId
    };
    await appendAndUpdateForSinglePersona({
      chatId,
      shouldEmitOrchestration,
      orchestrationEntry,
      personaEntry,
      leadPersona: IMAGE_AGENT
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
      leadPersona: IMAGE_AGENT,
      reason: "Image request routed to hidden image specialist for visual output.",
      content: "Image Concierge handled this image request in the background."
    });
    const styledPrompt = [
      "Visual style from the hidden Image Concierge capability agent.",
      `Conversation title: ${session?.title || "Persona Chat"}.`,
      `Shared context: ${session?.context || "(none)"}.`,
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
      speakerId: IMAGE_AGENT.id,
      displayName: IMAGE_AGENT.displayName,
      content: `Generated image based on your request: ${imageIntent.prompt}`,
      image,
      turnId: userEntry.turnId
    };
    await appendAndUpdateForSinglePersona({
      chatId,
      shouldEmitOrchestration,
      orchestrationEntry,
      personaEntry,
      leadPersona: IMAGE_AGENT
    });
    return {
      handled: true,
      payload: basePayload(userEntry, personaEntry, orchestrationEntry, shouldEmitOrchestration)
    };
  }

  return { handled: false };
}
