import { searchDocs } from "../tools/search_docs.js";
import { chatCompletion } from "../../lib/llm.js";
import { truncateText } from "../../lib/utils.js";
import { ensureSupportConciergeAssets } from "./supportAssets.js";
import { appendSupportMessage, listSupportMessages } from "./supportStorage.js";

function buildFallbackReply(citations) {
  if (!citations.length) {
    return [
      "I couldn’t find that clearly in the current docs.",
      "Please check `README.md`, `docs/API_GUIDE.md`, and the related route file under `server/routes/`.",
      "For runtime issues, inspect server logs and `data/settings/usage.jsonl`."
    ].join(" ");
  }

  const top = citations.slice(0, 4);
  const guidance = top
    .map((c, i) => {
      const compactExcerpt = String(c.excerpt || "").replace(/\s+/g, " ").trim().slice(0, 280);
      return `${i + 1}. ${c.file} -> ${c.heading}\n   ${compactExcerpt}`;
    })
    .join("\n");

  return [
    "Here’s what I found in the docs:",
    guidance,
    "",
    "If you want, I can turn one cited section into exact curl/Postman steps."
  ].join("\n");
}

function buildSupportSystemPrompt(persona, pack) {
  return [
    persona.systemPrompt,
    "",
    `Role/Title: ${persona.role || ""}`,
    `Tone: ${persona.speakingStyle?.tone || ""}`,
    `Verbosity: ${persona.speakingStyle?.verbosity || ""}`,
    "Conversation style: helpful and conversational, like a support concierge.",
    "Hard grounding rule: only use the citations/excerpts and documentation context provided in the user message.",
    "If not documented, explicitly say it is not documented and point to exact docs/logs for verification.",
    "Do not expose secrets or internal keys."
  ].join("\n");
}

function buildSupportUserPrompt({ message, citations, history }) {
  const citationBlock = citations.length
    ? citations
        .map(
          (c, i) =>
            `[Citation ${i + 1}] file=${c.file} heading=${c.heading}\nExcerpt:\n${truncateText(c.excerpt || "", 650)}`
        )
        .join("\n\n")
    : "(No citations found)";

  const historyBlock = history.length
    ? history
        .map(
          (h) =>
            `User: ${truncateText(h.message || "", 240)}\nSupport: ${truncateText(h.reply || "", 240)}`
        )
        .join("\n\n")
    : "(No recent support history)";

  return [
    "User question:",
    message,
    "",
    "Recent support conversation history:",
    historyBlock,
    "",
    "Retrieved documentation citations and excerpts:",
    citationBlock,
    "",
    "Respond conversationally, keep it practical, and reference what is known from citations."
  ].join("\n");
}

export async function answerSupportMessage({ message, user }) {
  const text = String(message || "").trim();
  if (!text) {
    const err = new Error("message is required");
    err.code = "VALIDATION_ERROR";
    throw err;
  }

  const citations = await searchDocs({ query: text, limit: 6 });
  const recent = await listSupportMessages({
    userId: user?.id || null,
    username: user?.username || null,
    limit: 6
  });
  let reply = "";

  if (!citations.length) {
    reply = buildFallbackReply(citations);
  } else {
    try {
      const { pack, persona } = await ensureSupportConciergeAssets();
      const completion = await chatCompletion({
        model: "gpt-5-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: buildSupportSystemPrompt(persona, pack)
          },
          {
            role: "user",
            content: buildSupportUserPrompt({
              message: text,
              citations,
              history: recent
            })
          }
        ]
      });
      reply = String(completion.text || "").trim() || buildFallbackReply(citations);
    } catch (error) {
      if (error.code === "MISSING_API_KEY") {
        reply = buildFallbackReply(citations);
      } else {
        reply = `${buildFallbackReply(citations)}\n\n(LLM assist temporarily unavailable: ${error.message})`;
      }
    }
  }

  await appendSupportMessage({
    ts: new Date().toISOString(),
    userId: user?.id || null,
    username: user?.username || null,
    message: text,
    reply,
    citations
  });

  return {
    reply,
    citations
  };
}
