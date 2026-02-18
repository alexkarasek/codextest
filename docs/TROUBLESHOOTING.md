# Troubleshooting

## 401 Unauthorized

### `Authentication required.`
Cause:
- Missing session cookie and missing/invalid `x-api-key`.

Fix:
- Login first (`/api/auth/login`) or send `x-api-key`.

### `/api/support/messages` returns `Authentication required.`
Cause:
- Missing/expired login session and no valid API key.

Fix:
- Login again or add header `x-api-key: <your key>`.

## API key issues

### Wrong/expired/revoked key
Symptoms:
- 401 on routes that normally work.

Fix:
- Generate a new key from `Admin & Config -> Users & Access`.
- Verify you copied the full key once at creation time.

### Newline / `%0A` in copied key
Symptoms:
- Key appears valid but always fails.

Fix:
- Remove trailing newline characters.
- In shell, use `echo -n` and quote key values.

Example:
```bash
curl -H "x-api-key: pk_..." http://localhost:3000/api/auth/me
```

## 404 Not Found

### `Route <METHOD> <PATH> not found.`
Cause:
- Wrong URL path or method.

Fix:
- Verify against `docs/openapi.yaml` and `docs/API_GUIDE.md`.

## Validation errors (400)

### `Invalid ... payload.`
Cause:
- Body shape does not match schema.

Common mistakes:
- Sending persona chat create payload without `selectedPersonas` objects.
- Sending message payload as `{role, content}` instead of `{message}`.
- Mismatched path ID vs body ID in update routes.

Fix:
- Inspect `error.details` in response.

## LLM configuration errors

### `MISSING_API_KEY`
Cause:
- LLM provider credentials are not configured.

Fix:
- Configure `settings.local.json` (`openaiApiKey`) or env overrides.

### Azure provider errors
Cause:
- Missing endpoint/deployment/api-version combination.

Fix:
- Set `llmProvider: "azure"` and provide required Azure fields in `settings.local.json`.

## Docker port conflicts

### Server will not start / port already in use
Cause:
- Another process/container is using `3000`.

Fix:
- Stop conflicting process/container or map a different host port.

Example:
```bash
docker run -p 3800:3000 ...
```
Then open `http://localhost:3800`.

## Corrupted JSON in data files
Symptoms:
- Errors like `CORRUPTED_PERSONA` or `INVALID_JSON`.

Fix:
- Open and repair malformed file in `data/personas` or other data folder.
- Validate JSON syntax before retrying.

## Debugging tips
- Check server logs for route-level error messages.
- Check `data/settings/usage.jsonl` for request status and path.
- For support requests, check `data/support/messages.jsonl`.
