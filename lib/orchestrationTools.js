function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value) {
  return String(value || "").trim();
}

function sanitizePreview(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") {
    const raw = String(value);
    if (/^sk-[a-z0-9]/i.test(raw)) return "[REDACTED]";
    if (/^Bearer\s+/i.test(raw)) return "[REDACTED]";
    if (/api[_-]?key|token|secret|password/i.test(raw)) return "[REDACTED]";
    return raw;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((entry) => sanitizePreview(entry));
  if (typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = /(key|token|secret|password|authorization)/i.test(key) ? "[REDACTED]" : sanitizePreview(child);
    }
    return out;
  }
  return String(value);
}

function sentenceLengths(text) {
  return normalizeText(text)
    .split(/[.!?]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(/\s+/).filter(Boolean).length);
}

function countStructuredLines(text) {
  return normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(-|\*|\d+\.)\s+/.test(line)).length;
}

function hasSensitivePattern(text) {
  return /(api[_-]?key|token|secret|password|-----begin|sk-[a-z0-9])/i.test(normalizeText(text));
}

function scoreClarity(text) {
  const lines = normalizeText(text).split("\n").filter((line) => line.trim());
  const lengths = sentenceLengths(text);
  const avgSentence = lengths.length ? lengths.reduce((sum, value) => sum + value, 0) / lengths.length : 0;
  let score = 55;
  if (avgSentence > 0) {
    if (avgSentence <= 16) score += 20;
    else if (avgSentence <= 24) score += 10;
    else if (avgSentence >= 35) score -= 15;
  }
  if (countStructuredLines(text) > 0) score += 15;
  if (lines.some((line) => line.length > 160)) score -= 10;
  return clamp(Math.round(score), 0, 100);
}

function scoreCompleteness(text) {
  const structured = countStructuredLines(text);
  const lengths = sentenceLengths(text);
  let score = 40;
  if (structured > 0) score += 25;
  if (lengths.length >= 2) score += 15;
  if (normalizeText(text).length >= 120) score += 10;
  if (normalizeText(text).length >= 260) score += 10;
  return clamp(Math.round(score), 0, 100);
}

function scoreSafety(text) {
  let score = 90;
  if (hasSensitivePattern(text)) score -= 45;
  if (/\b(ignore (all )?safety|bypass|exploit|exfiltrate)\b/i.test(text)) score -= 25;
  return clamp(Math.round(score), 0, 100);
}

function scoreAccuracy(text) {
  let score = 55;
  const normalized = normalizeText(text);
  if (/\b(maybe|likely|could|might|appears|suggests)\b/i.test(normalized)) score += 8;
  if (/\b(always|guaranteed|definitely|obviously)\b/i.test(normalized)) score -= 12;
  if (countStructuredLines(text) > 0) score += 5;
  if (!normalized) score = 0;
  return clamp(Math.round(score), 0, 100);
}

export function runPolicyGate(input = {}) {
  const server = input?.server && typeof input.server === "object" ? input.server : {};
  const trustState = normalizeText(server.trust_state).toLowerCase() || "untrusted";
  const riskTier = normalizeText(server.risk_tier).toLowerCase() || "medium";
  const toolName = normalizeText(input?.tool_name).toLowerCase();

  let decision = "allow";
  let riskScore = riskTier === "low" ? 20 : riskTier === "high" ? 55 : 30;
  const requiredControls = [];
  let reason = "Allowed by local orchestration policy.";

  if (trustState === "blocked") {
    decision = "deny";
    riskScore = 95;
    requiredControls.push("blocked_server");
    reason = "Server is blocked.";
  } else if (riskTier === "high") {
    decision = "approval_required";
    riskScore = Math.max(riskScore, 75);
    requiredControls.push("high_risk_tier");
    reason = "High-risk server tier requires approval.";
  }

  if (/(delete|write|admin)/i.test(toolName)) {
    riskScore = Math.max(riskScore, decision === "deny" ? 95 : 60);
    requiredControls.push("sensitive_tool");
    if (decision === "allow") {
      reason = "Sensitive tool detected; allow with elevated scrutiny.";
    } else if (decision === "approval_required") {
      reason = "Sensitive tool on elevated server requires approval.";
    }
  }

  return {
    schema_version: "1.0",
    decision,
    risk_score: clamp(Math.round(riskScore), 0, 100),
    reason,
    required_controls: [...new Set(requiredControls)]
  };
}

export function runEvaluateResponse(input = {}) {
  const criteria = Array.isArray(input?.rubric?.criteria) ? input.rubric.criteria : [];
  const candidates = Array.isArray(input?.candidates) ? input.candidates : [];
  if (!candidates.length) {
    const err = new Error("candidates are required.");
    err.code = "MCP_TOOL_VALIDATION_ERROR";
    throw err;
  }

  const normalizedCriteria = criteria
    .map((criterion) => ({
      name: normalizeText(criterion?.name),
      weight: Number(criterion?.weight)
    }))
    .filter((criterion) => criterion.name && Number.isFinite(criterion.weight) && criterion.weight >= 0);

  const activeCriteria = normalizedCriteria.length
    ? normalizedCriteria
    : [
        { name: "accuracy", weight: 0.25 },
        { name: "clarity", weight: 0.25 },
        { name: "completeness", weight: 0.25 },
        { name: "safety", weight: 0.25 }
      ];

  const scores = candidates.map((candidate, index) => {
    const id = normalizeText(candidate?.id) || `candidate-${index + 1}`;
    const text = normalizeText(candidate?.text);
    const criteriaScores = activeCriteria.map((criterion) => {
      const name = criterion.name.toLowerCase();
      let score = 50;
      if (name === "clarity") score = scoreClarity(text);
      else if (name === "completeness") score = scoreCompleteness(text);
      else if (name === "safety") score = scoreSafety(text);
      else if (name === "accuracy") score = scoreAccuracy(text);
      else score = clamp(Math.round((scoreClarity(text) + scoreCompleteness(text)) / 2), 0, 100);
      return {
        name: criterion.name,
        score
      };
    });

    const totalWeight = activeCriteria.reduce((sum, criterion) => sum + criterion.weight, 0) || 1;
    const weighted = criteriaScores.reduce((sum, item, idx) => sum + item.score * activeCriteria[idx].weight, 0);
    const total = clamp(Math.round(weighted / totalWeight), 0, 100);

    return {
      id,
      total,
      by_criteria: criteriaScores,
      notes: `Deterministic heuristic score for ${id}.`
    };
  });

  const winner = [...scores].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.id.localeCompare(b.id);
  })[0];

  return {
    schema_version: "1.0",
    winner_id: winner.id,
    scores
  };
}

export function runOrchestrationPlan(input = {}) {
  const goal = normalizeText(input?.goal);
  const userQuery = normalizeText(input?.inputs?.user_query);
  const availableModels = Array.isArray(input?.inputs?.available_models)
    ? input.inputs.available_models.map((value) => normalizeText(value)).filter(Boolean)
    : [];
  const availableAgents = Array.isArray(input?.inputs?.available_agents)
    ? input.inputs.available_agents.map((value) => normalizeText(value)).filter(Boolean)
    : [];
  const approvalMode = normalizeText(input?.controls?.approval_mode).toLowerCase() || "off";
  const governanceEnabled = Boolean(input?.controls?.governance_enabled);

  const steps = [
    {
      id: "step-1-policy",
      type: "policy_gate",
      description: "Check tool and server governance policy before any inference work.",
      inputs: {
        goal,
        approval_mode: approvalMode,
        governance_enabled: governanceEnabled
      },
      outputs: {
        decision: "allow|deny|approval_required",
        risk_score: "number",
        required_controls: "string[]"
      }
    },
    {
      id: "step-2-infer",
      type: "infer",
      description: "Select and call the best available model or agent for the request.",
      inputs: {
        user_query: userQuery,
        available_models: availableModels,
        available_agents: availableAgents
      },
      outputs: {
        candidate_responses: "array"
      }
    }
  ];

  if (availableModels.length + availableAgents.length >= 2) {
    steps.push({
      id: "step-3-evaluate",
      type: "evaluate_response",
      description: "Score multiple candidate responses and choose a winner.",
      inputs: {
        rubric: ["accuracy", "clarity", "completeness", "safety"]
      },
      outputs: {
        winner_id: "string",
        scores: "array"
      }
    });
  }

  if (approvalMode === "always" || (approvalMode === "untrusted_only" && governanceEnabled)) {
    steps.push({
      id: `step-${steps.length + 1}-approval`,
      type: "human_approval",
      description: "Pause for approval before any sensitive or untrusted execution.",
      inputs: {
        approval_mode: approvalMode
      },
      outputs: {
        approval_required: "boolean",
        approval_id: "string"
      }
    });
  }

  steps.push({
    id: `step-${steps.length + 1}-summarize`,
    type: "summarize",
    description: "Summarize the chosen result and next action for the operator.",
    inputs: {
      goal,
      user_query: userQuery
    },
    outputs: {
      summary: "string",
      next_steps: "array"
    }
  });

  return {
    schema_version: "1.0",
    steps,
    notes: "Deterministic orchestration plan only; no execution performed."
  };
}

export function getOrchestrationMcpServerDefinition() {
  return {
    id: "orchestration-local",
    name: "Orchestration (Local)",
    description: "Embedded deterministic orchestration tools for policy, evaluation, and planning.",
    transport: "local",
    source: "embedded",
    tools: [
      {
        name: "policy_gate",
        description: "Deterministic local policy gate for tool and server decisions.",
        inputSchema: {
          schema_version: "string",
          actor_id: "string (optional)",
          server: "object",
          tool_name: "string",
          input_preview: "object",
          context: "object (optional)"
        },
        run: async (input) => runPolicyGate(input)
      },
      {
        name: "evaluate_response",
        description: "Deterministically score multiple candidate responses with a local rubric.",
        inputSchema: {
          schema_version: "string",
          rubric: "object",
          candidates: "array"
        },
        run: async (input) => runEvaluateResponse(input)
      },
      {
        name: "orchestration_plan",
        description: "Generate a deterministic orchestration plan without executing anything.",
        inputSchema: {
          schema_version: "string",
          goal: "string",
          inputs: "object",
          controls: "object"
        },
        run: async (input) => runOrchestrationPlan(input)
      }
    ]
  };
}

export function sanitizePolicyInputPreview(value) {
  return sanitizePreview(value);
}
