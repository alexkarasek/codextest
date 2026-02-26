import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const projectRoot = process.cwd();
let tmpDir = "";
let engine = null;
let storage = null;

test.before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "persona-workflow-engine-"));
  process.chdir(tmpDir);
  engine = await import(pathToFileURL(path.join(projectRoot, "lib", "workflowEngine.js")).href + `?t=${Date.now()}`);
  storage = await import(pathToFileURL(path.join(projectRoot, "lib", "agenticStorage.js")).href + `?t=${Date.now()}`);
});

test.after(async () => {
  process.chdir(projectRoot);
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

test("create workflow and queue manual run", async () => {
  const workflow = await engine.createWorkflow({
    id: "wf-test",
    name: "WF Test",
    enabled: true,
    trigger: { type: "manual", cron: "", event: "", secret: "" },
    steps: [{ id: "step-1", name: "persist", type: "persistRecord", input: { path: "data/agentic/workflow-records/wf-test.txt", content: "hello" } }]
  });
  assert.equal(workflow.id, "wf-test");

  const queued = await engine.queueWorkflowRun({ workflowId: "wf-test", triggerType: "manual", triggerPayload: {} });
  assert.ok(queued.runId);
  assert.ok(queued.jobId);

  const runs = await storage.listWorkflowRuns({ workflowId: "wf-test", limit: 10 });
  assert.ok(runs.length >= 1);
  assert.equal(runs[0].workflowId, "wf-test");
  assert.equal(runs[0].status, "queued");
});
