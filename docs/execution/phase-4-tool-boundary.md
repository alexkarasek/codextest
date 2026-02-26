# Phase 4: Tool Execution Sandbox Boundary

This phase introduces a dedicated tool execution boundary so policy checks/timeouts are enforced consistently for all tool calls.

## What Changed

## Tool Runner Boundary
- Added `lib/toolRunner.js`.
- All tool execution now passes through `executeToolWithBoundary(...)` from `runTool` in `lib/agenticTools.js`.

## Enforced Controls

### 1) Network allowlist/denylist
- For network-capable tools (`http.request`, `web.fetch`, `knowledge.ingest_url`), hostname is validated against web policy:
  - policy source: `data/settings/web-policy.json`
  - denylist blocks always
  - allowlist (if non-empty) must match
- Failure code: `TOOL_DOMAIN_BLOCKED`

### 2) Filesystem allowlist
- For filesystem tools (`filesystem.read_text`, `filesystem.write_text`), path must pass tool allowlist policy when configured.
- policy source: `settings.local.json` -> `toolPolicy.fileAllowlist` (workspace-relative paths)
- Failure code: `TOOL_PATH_NOT_ALLOWED`

### 3) Timeouts
- Tool execution wrapped with timeout (`TOOL_TIMEOUT` on expiration).
- timeout source:
  - `input.timeoutMs` (if provided)
  - otherwise `settings.local.json` -> `toolPolicy.timeoutMs`
  - fallback default: `45000`

## Secret/Argument Handling in Audit
- Tool input metadata now captures a sanitized preview:
  - redacts headers like `authorization`, `x-api-key`, `cookie`, `api-key`

## Tests Added
- `tests/tool-runner-phase4.test.js`
  - domain block enforcement
  - filesystem allowlist enforcement
  - timeout enforcement

## Notes
- Existing tool behavior is preserved when policies are permissive/default.
- This creates a clear policy chokepoint for future hardening (capability tokens, per-tool secrets, stricter outbound controls).
