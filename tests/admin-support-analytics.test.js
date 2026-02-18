import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";

const projectRoot = process.cwd();
let tmpDir = "";

test.before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "persona-support-analytics-"));
  await fs.mkdir(path.join(tmpDir, "data", "support"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, "data", "support", "messages.jsonl"),
    `${JSON.stringify({
      ts: "2026-02-18T12:00:00.000Z",
      userId: "usr_1",
      username: "alex",
      message: "I think this is risky and could cause harm. How do I configure safeguards?",
      reply: "Use Responsible AI settings under Admin & Config to tune red/yellow terms and sentiment threshold.",
      citations: [
        {
          file: "docs/USER_GUIDE.md",
          heading: "G) Configure Responsible AI policy",
          excerpt: "Go to Admin & Config -> Responsible AI..."
        }
      ]
    })}\n`,
    "utf8"
  );
  process.chdir(tmpDir);
});

test.after(async () => {
  process.chdir(projectRoot);
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test("support logs are included in chat and governance analytics", async () => {
  const mod = await import(pathToFileURL(path.join(projectRoot, "lib", "adminAnalytics.js")).href + `?t=${Date.now()}`);

  const chats = await mod.getChatAnalyticsOverview(100);
  const support = (chats.chats || []).find((c) => c.kind === "support");

  assert.ok(support, "Expected support chat record in analytics overview");
  assert.equal(support.createdByUsername, "alex");
  assert.equal(support.responsibleAi?.groundedReplyCount, 1);
  assert.equal(support.messageCount, 2);

  const overview = await mod.getDebateAnalyticsOverview(100);
  assert.ok(Number(overview.totals?.chats || 0) >= 1);
  assert.ok((overview.chats || []).some((c) => c.kind === "support"));
});
