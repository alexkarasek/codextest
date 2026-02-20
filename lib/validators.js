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
  avatar: z.string().optional().default(""),
  role: z.string().optional().default(""),
  description: z.string().optional().default(""),
  systemPrompt: z.string().min(1, "systemPrompt is required"),
  speakingStyle: speakingStyleSchema,
  expertiseTags: z.array(z.string()).default([]),
  biasValues: z.union([z.array(z.string()), z.string()]).default([]),
  debateBehavior: z.string().default(""),
  toolIds: z.array(z.string()).default([]),
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
  maxWordsPerTurn: numberWithDefault({ defaultValue: 140, min: 40, max: 400, integer: true }),
  engagementMode: z.enum(["chat", "panel", "debate-work-order"]).default("chat"),
  panelAutoRounds: numberWithDefault({ defaultValue: 2, min: 0, max: 4, integer: true }).default(2)
});

export const createPersonaChatSchema = z.object({
  title: z.string().optional().default("Persona Collaboration Chat"),
  context: z.string().optional().default(""),
  selectedPersonas: z.array(selectedPersonaSchema).min(1, "Select at least one persona."),
  settings: personaChatSettingsSchema.default({}),
  knowledgePackIds: z.array(z.string()).optional().default([])
});

export const personaChatMessageSchema = z.object({
  message: z.string().min(1, "message is required"),
  historyLimit: numberWithDefault({ defaultValue: 14, min: 4, max: 40, integer: true }).optional().default(14)
});

export const simpleChatSettingsSchema = z.object({
  model: z.string().default("gpt-4.1-mini"),
  temperature: numberWithDefault({ defaultValue: 0.4, min: 0, max: 2 }),
  maxResponseWords: numberWithDefault({ defaultValue: 220, min: 40, max: 800, integer: true })
});

export const createSimpleChatSchema = z.object({
  title: z.string().optional().default("Simple Chat"),
  context: z.string().optional().default(""),
  knowledgePackIds: z.array(z.string()).optional().default([]),
  settings: simpleChatSettingsSchema.default({})
});

export const simpleChatMessageSchema = z.object({
  message: z.string().min(1, "message is required"),
  historyLimit: numberWithDefault({ defaultValue: 14, min: 4, max: 60, integer: true }).optional().default(14)
});

export const agenticTeamSchema = z.object({
  mode: z.enum(["auto", "manual"]).default("auto"),
  personaIds: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  maxAgents: numberWithDefault({ defaultValue: 3, min: 1, max: 8, integer: true }).default(3)
});

export const agenticTaskStepSchema = z
  .object({
    id: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    type: z.enum(["tool", "llm", "job"]).default("tool"),
    toolId: z.string().optional().default(""),
    prompt: z.string().optional().default(""),
    model: z.string().optional().default(""),
    input: z.record(z.any()).optional().default({}),
    requiresApproval: z.boolean().optional().default(false),
    dependsOn: z.array(z.string().min(1)).optional().default([])
  })
  .superRefine((step, ctx) => {
    if (step.type === "tool" && !String(step.toolId || "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "toolId is required for tool steps.",
        path: ["toolId"]
      });
    }
    if (step.type === "llm" && !String(step.prompt || "").trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prompt is required for llm steps.",
        path: ["prompt"]
      });
    }
  });

export const createAgenticTaskSchema = z.object({
  title: z.string().optional().default("Agentic Task"),
  objective: z.string().optional().default(""),
  team: agenticTeamSchema.optional().default({}),
  settings: z
    .object({
      model: z.string().default("gpt-4.1-mini"),
      temperature: numberWithDefault({ defaultValue: 0.3, min: 0, max: 2 })
    })
    .optional()
    .default({}),
  steps: z.array(agenticTaskStepSchema).min(1, "At least one step is required."),
  runImmediately: z.boolean().optional().default(false)
});

export const runAgenticTaskSchema = z.object({
  maxSteps: numberWithDefault({ defaultValue: 100, min: 1, max: 500, integer: true }).optional().default(100)
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().optional().default("")
});

export const routerPreviewSchema = z.object({
  mode: z.enum(["auto", "manual"]).optional().default("auto"),
  personaIds: z.array(z.string().min(1)).optional().default([]),
  tags: z.array(z.string().min(1)).optional().default([]),
  maxAgents: numberWithDefault({ defaultValue: 3, min: 1, max: 8, integer: true }).optional().default(3)
});

export const agenticPlanRequestSchema = z.object({
  goal: z.string().min(1, "goal is required"),
  constraints: z.string().optional().default(""),
  maxSteps: numberWithDefault({ defaultValue: 6, min: 1, max: 12, integer: true }).optional().default(6),
  team: agenticTeamSchema.optional().default({})
});

export const watcherCheckSchema = z.union([
  z.object({
    type: z.literal("http"),
    url: z.string().url()
  }),
  z.object({
    type: z.literal("file"),
    path: z.string().min(1)
  })
]);

const watcherTaskActionSchema = z.object({
  type: z.literal("task"),
  runImmediately: z.boolean().optional().default(false),
  template: z.object({
    title: z.string().optional().default(""),
    objective: z.string().optional().default(""),
    team: agenticTeamSchema.optional().default({}),
    settings: z
      .object({
        model: z.string().default("gpt-4.1-mini"),
        temperature: numberWithDefault({ defaultValue: 0.3, min: 0, max: 2 })
      })
      .optional()
      .default({}),
    steps: z.array(agenticTaskStepSchema).min(1, "At least one step is required.")
  })
});

const watcherKnowledgeActionSchema = z.object({
  type: z.literal("knowledge-pack"),
  mode: z.enum(["append", "overwrite", "create"]).optional().default("append"),
  summarize: z.boolean().optional().default(true),
  tags: z.array(z.string()).optional().default([]),
  template: z.object({
    title: z.string().optional().default(""),
    objective: z.string().optional().default(""),
    packId: z.string().min(1, "packId is required")
  })
});

export const watcherActionSchema = z.union([watcherTaskActionSchema, watcherKnowledgeActionSchema]);

export const createWatcherSchema = z.object({
  name: z.string().min(1, "name is required"),
  enabled: z.boolean().optional().default(true),
  check: watcherCheckSchema,
  action: watcherActionSchema
});

export const runWatcherSchema = z.object({
  runImmediately: z.boolean().optional().default(false)
});

export const responsibleAiPolicySchema = z.object({
  stoplight: z.object({
    redKeywords: z.array(z.string().min(1)).default([]),
    yellowKeywords: z.array(z.string().min(1)).default([])
  }).default({
    redKeywords: [],
    yellowKeywords: []
  }),
  sentiment: z.object({
    positiveKeywords: z.array(z.string().min(1)).default([]),
    negativeKeywords: z.array(z.string().min(1)).default([]),
    threshold: numberWithDefault({ defaultValue: 1, min: 1, max: 5, integer: true })
  }).default({
    positiveKeywords: [],
    negativeKeywords: [],
    threshold: 1
  })
});

export const webPolicySchema = z.object({
  allowlist: z.array(z.string().min(1)).default([]),
  denylist: z.array(z.string().min(1)).default([])
});

export function formatZodError(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}
