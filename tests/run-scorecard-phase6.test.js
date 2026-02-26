import test from "node:test";
import assert from "node:assert/strict";
import { compareScorecards, computeRunScorecard } from "../lib/runScorecard.js";

test("computeRunScorecard returns bounded metrics", () => {
  const summary = {
    durationMs: 120000,
    estimatedCostUsd: 0.02,
    llmCalls: 4
  };
  const events = [
    { eventType: "ToolFinished", data: { ok: true } },
    { eventType: "ToolFinished", data: { ok: false } },
    { eventType: "LLMCallFinished", data: { outputText: "done" } },
    { eventType: "LLMCallFinished", data: { outputText: "I cannot do that" } }
  ];
  const score = computeRunScorecard(summary, events);
  assert.ok(score.overall >= 0 && score.overall <= 100);
  assert.ok(score.metrics.toolSuccessRate >= 0 && score.metrics.toolSuccessRate <= 100);
  assert.ok(score.metrics.refusalRate >= 0 && score.metrics.refusalRate <= 100);
});

test("compareScorecards returns winner and diff", () => {
  const cmp = compareScorecards({ overall: 70 }, { overall: 50 });
  assert.equal(cmp.winner, "runA");
  assert.equal(cmp.overallDiff, 20);
});
