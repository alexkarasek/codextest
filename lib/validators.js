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

export const debateSettingsSchema = z.object({
  rounds: z.number().int().min(1).max(8).default(3),
  maxWordsPerTurn: z.number().int().min(40).max(400).default(120),
  moderationStyle: z.string().default("neutral"),
  model: z.string().default("gpt-4.1-mini"),
  temperature: z.number().min(0).max(2).default(0.7),
  includeModerator: z.boolean().default(true)
});

export const createDebateSchema = z.object({
  topic: z.string().min(1, "topic is required"),
  context: z.string().optional().default(""),
  selectedPersonas: z.array(selectedPersonaSchema).min(1, "Select at least one persona"),
  settings: debateSettingsSchema.default({})
});

export function formatZodError(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}
