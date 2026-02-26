import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const projectRoot = process.cwd();
let tmpDir = "";
let runner = null;

test.before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "persona-tool-runner-"));
  await fs.mkdir(path.join(tmpDir, "data", "settings"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "data", "settings", "web-policy.json"),
    JSON.stringify({ allowlist: [], denylist: ["blocked.example.com"] }, null, 2),
    "utf8"
  );
  await fs.writeFile(
    path.join(tmpDir, "settings.local.json"),
    JSON.stringify({ toolPolicy: { timeoutMs: 50, fileAllowlist: ["data"] } }, null, 2),
    "utf8"
  );
  process.chdir(tmpDir);
  runner = await import(pathToFileURL(path.join(projectRoot, "lib", "toolRunner.js")).href + `?t=${Date.now()}`);
});

test.after(async () => {
  process.chdir(projectRoot);
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
});

test("tool runner blocks disallowed domain by web policy", async () => {
  await assert.rejects(
    () =>
      runner.executeToolWithBoundary({
        toolId: "http.request",
        input: { url: "https://blocked.example.com/news" },
        execute: async () => ({ ok: true })
      }),
    (error) => error?.code === "TOOL_DOMAIN_BLOCKED"
  );
});

test("tool runner blocks filesystem path outside allowlist", async () => {
  await assert.rejects(
    () =>
      runner.executeToolWithBoundary({
        toolId: "filesystem.read_text",
        input: { path: "README.md" },
        execute: async () => ({ ok: true })
      }),
    (error) => error?.code === "TOOL_PATH_NOT_ALLOWED"
  );
});

test("tool runner enforces timeout", async () => {
  await assert.rejects(
    () =>
      runner.executeToolWithBoundary({
        toolId: "filesystem.write_text",
        input: { path: "data/test.txt", timeoutMs: 60 },
        execute: async () => {
          await new Promise((resolve) => setTimeout(resolve, 120));
          return { ok: true };
        }
      }),
    (error) => error?.code === "TOOL_TIMEOUT"
  );
});
