import test from "node:test";
import assert from "node:assert/strict";
import runsRouter from "../server/routes/runs.js";

test("runs router exposes compare endpoint", () => {
  const exists = runsRouter.stack.some(
    (entry) => entry.route && entry.route.path === "/compare/:runA/:runB" && entry.route.methods.get
  );
  assert.equal(exists, true);
});
