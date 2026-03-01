import { appendPersonaChatMessage, updatePersonaChatSession } from "../../lib/storage.js";
import { generateAndStoreImage } from "../../lib/images.js";
import { truncateText } from "../../lib/utils.js";

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
  const latestImageContext =
    personaEntry?.imageContext && typeof personaEntry.imageContext === "object"
      ? [
          personaEntry.imageContext.prompt ? `Prompt: ${personaEntry.imageContext.prompt}` : "",
          personaEntry.imageContext.revisedPrompt ? `Revised prompt: ${personaEntry.imageContext.revisedPrompt}` : ""
        ].filter(Boolean).join("\n")
      : "";
  await updatePersonaChatSession(chatId, (current) => ({
    ...current,
    updatedAt: new Date().toISOString(),
    messageCount: Number(current.messageCount || 0) + (shouldEmitOrchestration ? 3 : 2),
    turnIndex: Number(current.turnIndex || 0) + 1,
    lastSpeakerIds: [leadPersona.id],
    latestImageContext: latestImageContext || current.latestImageContext || ""
  }));
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
      `Latest generated image artifact:\n${String(session?.latestImageContext || "(none)")}`,
      `Recent conversation:\n${
        (Array.isArray(history) ? history : [])
          .filter((row) => row && (row.role === "user" || row.role === "persona"))
          .slice(-8)
          .map((row) =>
            row.role === "user"
              ? `User: ${truncateText(row.content || "", 260)}`
              : `${row.displayName || "Persona"}: ${truncateText(row.content || "", 260)}`
          )
          .join("\n") || "(none)"
      }`,
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
      imageContext: {
        prompt: image.prompt || "",
        revisedPrompt: image.revisedPrompt || ""
      },
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
