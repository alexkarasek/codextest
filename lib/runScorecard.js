function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function computeRunScorecard(summary = {}, events = []) {
  const durationMs = toNumber(summary.durationMs, 0);
  const cost = toNumber(summary.estimatedCostUsd, 0);
  const llmCalls = toNumber(summary.llmCalls, 0);

  const toolFinished = (events || []).filter((e) => String(e.eventType || "") === "ToolFinished");
  const toolOk = toolFinished.filter((e) => e?.data?.ok === true).length;
  const toolTotal = toolFinished.length;
  const toolSuccessRate = toolTotal ? toolOk / toolTotal : 1;

  const llmFinished = (events || []).filter((e) => String(e.eventType || "") === "LLMCallFinished");
  const refusalHits = llmFinished.filter((e) => {
    const text = String(e?.data?.outputText || "").toLowerCase();
    return text.includes("i can\'t") || text.includes("i cannot") || text.includes("outside my scope") || text.includes("unable to");
  }).length;
  const refusalRate = llmCalls ? refusalHits / llmCalls : 0;

  const evidenceHints = (events || []).filter((e) => {
    const t = String(e?.eventType || "");
    return t === "ToolFinished" || t === "LLMCallFinished";
  }).length;
  const groundedness = llmCalls ? Math.min(1, evidenceHints / Math.max(1, llmCalls * 2)) : 0;

  const latencyScore = durationMs <= 0 ? 1 : 1 / (1 + durationMs / 120000);
  const costScore = 1 / (1 + cost / 0.05);

  const weighted =
    latencyScore * 0.24 +
    costScore * 0.22 +
    clamp01(toolSuccessRate) * 0.22 +
    (1 - clamp01(refusalRate)) * 0.16 +
    clamp01(groundedness) * 0.16;

  return {
    overall: Number((clamp01(weighted) * 100).toFixed(1)),
    metrics: {
      latencyMs: durationMs,
      latencyScore: Number((clamp01(latencyScore) * 100).toFixed(1)),
      estimatedCostUsd: Number(cost.toFixed(8)),
      costScore: Number((clamp01(costScore) * 100).toFixed(1)),
      toolSuccessRate: Number((clamp01(toolSuccessRate) * 100).toFixed(1)),
      refusalRate: Number((clamp01(refusalRate) * 100).toFixed(1)),
      groundedness: Number((clamp01(groundedness) * 100).toFixed(1))
    },
    rationale: [
      "Latency and cost are normalized so lower is better.",
      "Tool success improves score; refusals reduce score.",
      "Groundedness is a lightweight heuristic from evidence/tool usage."
    ]
  };
}

export function compareScorecards(a = {}, b = {}) {
  const aScore = toNumber(a?.overall, 0);
  const bScore = toNumber(b?.overall, 0);
  const diff = Number((aScore - bScore).toFixed(1));
  return {
    runAOverall: aScore,
    runBOverall: bScore,
    overallDiff: diff,
    winner: diff === 0 ? "tie" : diff > 0 ? "runA" : "runB"
  };
}
