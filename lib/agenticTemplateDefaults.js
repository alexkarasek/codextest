import { listTaskTemplates, saveTaskTemplate } from "./agenticStorage.js";

const DEFAULT_TEMPLATES = [
  {
    id: "tpl-web-to-knowledge-pack",
    name: "Web: Ingest URL to Knowledge Pack",
    title: "Web Ingest Knowledge Pack",
    objective: "Fetch a web page and store it as a reusable knowledge pack.",
    team: { mode: "auto", personaIds: [], tags: ["web", "knowledge"], maxAgents: 3 },
    settings: { model: "gpt-5-mini", temperature: 0.3 },
    steps: [
      {
        id: "step-1",
        name: "Ingest URL",
        type: "tool",
        toolId: "knowledge.ingest_url",
        input: {
          url: "https://example.com",
          summarize: true,
          mode: "create"
        },
        dependsOn: [],
        requiresApproval: false
      },
      {
        id: "step-2",
        name: "Write ingest summary",
        type: "tool",
        toolId: "filesystem.write_text",
        input: {
          path: "data/agentic/reports/web-ingest-summary.txt",
          content: "{{steps.step-1.result.pack.title}}\\n{{steps.step-1.result.pack.description}}"
        },
        dependsOn: ["step-1"],
        requiresApproval: false
      }
    ]
  },
  {
    id: "tpl-mcp-knowledge-summary",
    name: "MCP: Knowledge Pack Summary",
    title: "Knowledge Pack Summary (MCP)",
    objective: "Summarize available knowledge packs and store a concise overview.",
    team: { mode: "auto", personaIds: [], tags: ["mcp", "knowledge"], maxAgents: 3 },
    settings: { model: "gpt-5-mini", temperature: 0.3 },
    steps: [
      {
        id: "step-1",
        name: "List knowledge packs",
        type: "tool",
        toolId: "mcp.platform.knowledge.list",
        input: { includeHidden: false },
        dependsOn: [],
        requiresApproval: false
      },
      {
        id: "step-2",
        name: "Summarize inventory",
        type: "llm",
        prompt:
          "Summarize the available knowledge packs in 5 bullets. Highlight missing coverage if obvious.\\n\\n{{steps.step-1.result}}",
        dependsOn: ["step-1"],
        requiresApproval: false
      },
      {
        id: "step-3",
        name: "Write summary report",
        type: "tool",
        toolId: "filesystem.write_text",
        input: {
          path: "data/agentic/reports/mcp-knowledge-summary.txt",
          content: "{{steps.step-2.result.text}}"
        },
        dependsOn: ["step-2"],
        requiresApproval: false
      }
    ]
  },
  {
    id: "tpl-mcp-persona-inventory",
    name: "MCP: Persona Inventory",
    title: "Persona Inventory Snapshot (MCP)",
    objective: "List personas and identify obvious role or expertise gaps.",
    team: { mode: "auto", personaIds: [], tags: ["mcp", "personas"], maxAgents: 3 },
    settings: { model: "gpt-5-mini", temperature: 0.2 },
    steps: [
      {
        id: "step-1",
        name: "List personas",
        type: "tool",
        toolId: "mcp.platform.personas.list",
        input: { includeHidden: false },
        dependsOn: [],
        requiresApproval: false
      },
      {
        id: "step-2",
        name: "Identify gaps",
        type: "llm",
        prompt:
          "Given this persona list, propose 3 missing roles or expertise areas that would improve coverage.\\n\\n{{steps.step-1.result}}",
        dependsOn: ["step-1"],
        requiresApproval: false
      },
      {
        id: "step-3",
        name: "Write persona report",
        type: "tool",
        toolId: "filesystem.write_text",
        input: {
          path: "data/agentic/reports/mcp-persona-inventory.txt",
          content: "{{steps.step-2.result.text}}"
        },
        dependsOn: ["step-2"],
        requiresApproval: false
      }
    ]
  },
  {
    id: "tpl-mcp-agentic-activity",
    name: "MCP: Agentic Activity Snapshot",
    title: "Agentic Activity Snapshot (MCP)",
    objective: "Review recent tool usage and summarize activity signals.",
    team: { mode: "auto", personaIds: [], tags: ["mcp", "observability"], maxAgents: 3 },
    settings: { model: "gpt-5-mini", temperature: 0.2 },
    steps: [
      {
        id: "step-1",
        name: "Fetch tool events",
        type: "tool",
        toolId: "mcp.platform.agentic.events.tail",
        input: { type: "tool", limit: 50 },
        dependsOn: [],
        requiresApproval: false
      },
      {
        id: "step-2",
        name: "Summarize activity",
        type: "llm",
        prompt:
          "Summarize these tool events into a brief activity snapshot. Call out top tools and any errors.\\n\\n{{steps.step-1.result}}",
        dependsOn: ["step-1"],
        requiresApproval: false
      },
      {
        id: "step-3",
        name: "Write activity note",
        type: "tool",
        toolId: "filesystem.write_text",
        input: {
          path: "data/agentic/reports/mcp-activity-snapshot.txt",
          content: "{{steps.step-2.result.text}}"
        },
        dependsOn: ["step-2"],
        requiresApproval: false
      }
    ]
  }
];

export async function ensureDefaultAgenticTemplates() {
  const existing = await listTaskTemplates();
  const existingIds = new Set(existing.map((template) => template.id));
  for (const template of DEFAULT_TEMPLATES) {
    if (existingIds.has(template.id)) continue;
    await saveTaskTemplate(template);
  }
}
