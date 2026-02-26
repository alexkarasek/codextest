import test from "node:test";
import assert from "node:assert/strict";
import agenticRouter from "../server/routes/agentic.js";

function hasRoute(routePath, method) {
  return agenticRouter.stack.some(
    (entry) => entry.route && entry.route.path === routePath && entry.route.methods[String(method).toLowerCase()]
  );
}

test("agentic router exposes workflow endpoints", () => {
  assert.equal(hasRoute("/workflows", "get"), true);
  assert.equal(hasRoute("/workflows", "post"), true);
  assert.equal(hasRoute("/workflows/:workflowId", "put"), true);
  assert.equal(hasRoute("/workflows/:workflowId", "delete"), true);
  assert.equal(hasRoute("/workflows/:workflowId/run", "post"), true);
  assert.equal(hasRoute("/workflows/:workflowId/trigger", "post"), true);
});
