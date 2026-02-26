import test from "node:test";
import assert from "node:assert/strict";
import debatesRouter from "../server/routes/debates.js";

test("debates router exposes POST /run endpoint", () => {
  const layer = debatesRouter.stack.find(
    (entry) => entry.route && entry.route.path === "/run" && entry.route.methods.post
  );
  assert.ok(layer, "Expected POST /run route to exist");
});
