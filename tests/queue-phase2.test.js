import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const projectRoot = process.cwd();
let tmpDir = "";

let queue = null;

test.before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "persona-phase2-queue-"));
  process.chdir(tmpDir);
  queue = await import(pathToFileURL(path.join(projectRoot, "packages", "core", "queue", "index.js")).href + `?t=${Date.now()}`);
});

test.after(async () => {
  process.chdir(projectRoot);
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

test("enqueue dedupes by idempotency key and dequeue/ack works", async () => {
  const first = await queue.enqueue("RUN_DEBATE", { debateId: "d1" }, { runId: "d1", idempotencyKey: "RUN_DEBATE:d1" });
  const second = await queue.enqueue("RUN_DEBATE", { debateId: "d1" }, { runId: "d1", idempotencyKey: "RUN_DEBATE:d1" });

  assert.equal(first.deduped, false);
  assert.equal(second.deduped, true);
  assert.equal(second.job.id, first.job.id);

  const next = await queue.dequeue({ workerId: "w1", jobTypes: ["RUN_DEBATE"] });
  assert.ok(next);
  assert.equal(next.id, first.job.id);
  assert.equal(next.status, "running");

  const done = await queue.ack(next.id, { ok: true });
  assert.equal(done.status, "completed");
  assert.deepEqual(done.result, { ok: true });
});

test("fail retries until max attempts then marks failed", async () => {
  const created = await queue.enqueue("RUN_DEBATE", { debateId: "d2" }, { runId: "d2", maxAttempts: 2 });

  let job = await queue.dequeue({ workerId: "w1", jobTypes: ["RUN_DEBATE"] });
  assert.equal(job.id, created.job.id);

  let after = await queue.fail(job.id, Object.assign(new Error("boom-1"), { code: "BOOM" }), { backoffBaseMs: 1 });
  assert.equal(after.status, "pending");

  after = { ...after, availableAt: new Date(Date.now() - 1).toISOString() };
  await fs.writeFile(path.join(tmpDir, "data", "queue", "jobs", `${after.id}.json`), JSON.stringify(after, null, 2), "utf8");

  job = await queue.dequeue({ workerId: "w1", jobTypes: ["RUN_DEBATE"] });
  assert.equal(job.attempts, 2);

  const failed = await queue.fail(job.id, Object.assign(new Error("boom-2"), { code: "BOOM" }), { backoffBaseMs: 1 });
  assert.equal(failed.status, "failed");
  assert.equal(failed.lastError.code, "BOOM");
});
