import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const projectRoot = process.cwd();
let tmpDir = "";
let repoModule = null;

test.before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "persona-run-repo-"));
  await fs.mkdir(path.join(tmpDir, "data", "debates", "20260220-000001-sample"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "data", "debates", "20260220-000001-sample", "session.json"),
    JSON.stringify(
      {
        topic: "Sample",
        status: "completed",
        createdAt: "2026-02-20T00:00:00.000Z",
        completedAt: "2026-02-20T00:05:00.000Z",
        personas: [{ displayName: "P1" }]
      },
      null,
      2
    ),
    "utf8"
  );
  process.chdir(tmpDir);
  repoModule = await import(pathToFileURL(path.join(projectRoot, "packages", "core", "repositories", "file", "runRepository.js")).href + `?t=${Date.now()}`);
});

test.after(async () => {
  process.chdir(projectRoot);
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

test("run repository upsert/list/get works", async () => {
  const repo = new repoModule.FileRunRepository();
  await repo.upsert({ id: "run_a", kind: "debate", status: "pending" });
  await repo.upsert({ id: "run_a", status: "running", requestId: "req_1" });

  const one = await repo.getById("run_a");
  assert.ok(one);
  assert.equal(one.id, "run_a");
  assert.equal(one.status, "running");
  assert.equal(one.requestId, "req_1");

  const rows = await repo.list({ limit: 10 });
  assert.ok(rows.some((r) => r.id === "run_a"));
});

test("run repository can migrate legacy debates", async () => {
  const repo = new repoModule.FileRunRepository();
  const result = await repo.migrateFromLegacyDebates({ limit: 100 });
  assert.ok(result.imported >= 1);

  const migrated = await repo.getById("20260220-000001-sample");
  assert.ok(migrated);
  assert.equal(migrated.kind, "debate");
  assert.equal(migrated.status, "completed");
});
