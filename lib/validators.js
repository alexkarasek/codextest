import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const speakingStyleSchema = z
  .object({
    tone: z.string().default(""),
    verbosity: z.string().default(""),
    quirks: z.array(z.string()).default([])
  })
  .default({ tone: "", verbosity: "", quirks: [] });

export const personaSchema = z.object({
  id: z
    .string()
    .min(1, "id is required")
    .regex(slugRegex, "id must be a slug like policy-analyst"),
  displayName: z.string().min(1, "displayName is required"),
  role: z.string().optional().default(""),
  description: z.string().min(1, "description is required"),
  systemPrompt: z.string().min(1, "systemPrompt is required"),
  speakingStyle: speakingStyleSchema,
  expertiseTags: z.array(z.string()).default([]),
  biasValues: z.union([z.array(z.string()), z.string()]).default([]),
  debateBehavior: z.string().default(""),
  knowledgePackIds: z.array(z.string()).default([]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export const adHocPersonaSchema = personaSchema
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    id: z
      .string()
      .regex(slugRegex, "id must be a slug like policy-analyst")
      .optional()
  });

export const selectedPersonaSchema = z.union([
  z.object({
    type: z.literal("saved"),
    id: z.string().min(1)
  }),
  z.object({
    type: z.literal("adhoc"),
    savePersona: z.boolean().optional().default(false),
    persona: adHocPersonaSchema
  })
]);

export const topicSourceSchema = z.object({
  title: z.string().min(1),
  source: z.string().optional().default(""),
  url: z.string().url(),
  publishedAt: z.string().nullable().optional().default(null),
  snippet: z.string().optional().default("")
});

export const knowledgePackSchema = z.object({
  id: z
    .string()
    .min(1, "id is required")
    .regex(slugRegex, "id must be a slug like climate-brief"),
  title: z.string().min(1, "title is required"),
  description: z.string().optional().default(""),
  tags: z.array(z.string()).default([]),
  content: z.string().min(1, "content is required"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export const topicDiscoverySchema = z.object({
  query: z.string().optional().default(""),
  selectedTitle: z.string().optional().default(""),
  selectedSummary: z.string().optional().default(""),
  sources: z.array(topicSourceSchema).default([])
});

function numberWithDefault({ defaultValue, min, max, integer = false }) {
  let numberSchema = z.number();
  if (integer) numberSchema = numberSchema.int();
  if (typeof min === "number") numberSchema = numberSchema.min(min);
  if (typeof max === "number") numberSchema = numberSchema.max(max);

  return z.preprocess((value) => {
    if (value === "" || value === null || typeof value === "undefined") {
      return defaultValue;
    }
    if (typeof value === "string" && value.trim() === "") {
      return defaultValue;
    }
    const n = Number(value);
    return Number.isFinite(n) ? n : defaultValue;
  }, numberSchema);
}

export const debateSettingsSchema = z.object({
  rounds: numberWithDefault({ defaultValue: 3, min: 1, max: 8, integer: true }),
  maxWordsPerTurn: numberWithDefault({ defaultValue: 120, min: 40, max: 400, integer: true }),
  moderationStyle: z.string().default("neutral"),
  sourceGroundingMode: z.enum(["off", "light", "strict"]).default("light"),
  model: z.string().default("gpt-4.1-mini"),
  temperature: numberWithDefault({ defaultValue: 0.7, min: 0, max: 2 }),
  includeModerator: z.boolean().default(true)
});

export const createDebateSchema = z.object({
  topic: z.string().min(1, "topic is required"),
  context: z.string().optional().default(""),
  selectedPersonas: z.array(selectedPersonaSchema).default([]),
  settings: debateSettingsSchema.default({}),
  knowledgePackIds: z.array(z.string()).optional().default([]),
  topicDiscovery: topicDiscoverySchema.optional().default({
    query: "",
    selectedTitle: "",
    selectedSummary: "",
    sources: []
  })
});

export const personaChatSettingsSchema = z.object({
  model: z.string().default("gpt-4.1-mini"),
  temperature: numberWithDefault({ defaultValue: 0.6, min: 0, max: 2 }),
  maxWordsPerTurn: numberWithDefault({ defaultValue: 140, min: 40, max: 400, integer: true })
});

export const createPersonaChatSchema = z.object({
  title: z.string().optional().default("Persona Collaboration Chat"),
  context: z.string().optional().default(""),
  selectedPersonas: z.array(selectedPersonaSchema).min(1, "Select at least one persona."),
  settings: personaChatSettingsSchema.default({})
});

export const personaChatMessageSchema = z.object({
  message: z.string().min(1, "message is required"),
  historyLimit: numberWithDefault({ defaultValue: 14, min: 4, max: 40, integer: true }).optional().default(14)
});

export function formatZodError(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}
