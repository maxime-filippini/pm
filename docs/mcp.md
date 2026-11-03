# Agent MCP endpoint

The first M5 implementation exposes the shared command set over stateless MCP Streamable HTTP at:

```text
https://<pm-host>/api/w/<workspace-slug>/mcp?client=Claude
```

Each request requires the existing Cloudflare Access identity and a current D1 registry membership in that Workspace. Agents act as the connecting human Member; actor IDs and identity headers supplied by clients cannot select another Member. All commands use the same validation, authorization, synchronous transactions, Activity and WebSocket broadcasts as the app. This endpoint grants the same Workspace permissions as the app, including Project GitHub-token configuration.

## Tools and protocol

`tools/list` derives input schemas from `src/shared/commands.ts` and `src/shared/protocol.ts`. Every command is available under its existing name, such as `task.create`, `meeting.recordOutcome` and `comment.edit`. Read tools are `workspace.snapshot`, `search`, `comments.list` and `activity.list`. `ids.generate` creates a UUIDv7 for commands that require new entity IDs. Read the snapshot first to find existing IDs; Activity and Comments use their existing pagination cursors. Validation and domain failures return MCP tool results with `isError: true` and a JSON error code/message. Protocol failures use the SDK's JSON-RPC errors.

The endpoint supports POST requests with `Content-Type: application/json` and `Accept: application/json, text/event-stream`. It returns JSON responses and retains no MCP session in Worker memory. GET/SSE subscriptions and DELETE sessions are unsupported (405); browser synchronization continues through the existing Workspace WebSockets. Requests with an Origin must match the endpoint origin. Bodies are limited to 128 KiB. Authenticated MCP responses are marked `Cache-Control: no-store`.

The optional `client` query parameter is a self-declared display label used for Activity's `via`, limited to 100 letters/digits/spaces or `._/-`. It defaults to `MCP`. Configure a distinct name for each agent connection. The label is not authenticated identity or a permission boundary. Because transports are stateless, the endpoint does not retain `initialize.clientInfo` for later requests. No tool accepts an actor ID or a separate `via` override.

Creation commands require caller-supplied IDs and do not promise automatic retry deduplication. After a network error, inspect the snapshot before retrying a creation. Task/Meeting deletion is soft and supports restore. GitHub tokens are write-only and stay out of snapshots and Activity.

## Managed OAuth rollout — still required

The Worker reuses its existing validation of `Cf-Access-Jwt-Assertion` (signature, issuer, audience, expiry and human email). It does not trust an unverified bearer token as identity or implement a separate OAuth authorization server.

Cloudflare's [Managed OAuth documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/) describes enabling Managed OAuth for the Access application and forwarding a validated Access JWT to the MCP server. Enable it for the appropriate preview application and confirm the configured `ACCESS_AUD` matches that application's audience. Preserve the existing email allowlist and protect the MCP URL as well as the app. The `/api/*` Worker-first asset rule already covers the endpoint.

Before declaring M5 complete:

1. Enable Managed OAuth in Access for preview, including the Claude connector's permitted redirect/client configuration.
2. Connect Claude to the Workspace endpoint above using OAuth; confirm the browser sign-in resolves to the expected Member and that an uninvited email is denied.
3. Run snapshot/search and a reversible command through that connector. Observe its Activity actor/`via` in the app and the change in a connected browser.
4. Remove that Member from the Workspace and confirm subsequent calls are denied; also verify expired/invalid credentials cannot reach tools.
5. Repeat on production only after reviewing the preview results and intended Access application configuration.

This PR does not configure Access, provision credentials, or claim a live Claude OAuth test. If that test demonstrates incompatibility, ADR 0003's fallback is `workers-oauth-provider` with Access upstream. Do not add a second authentication system before that evidence exists.

For local development, use the existing `.dev.vars` identity and `pnpm dev`; never enable `DEV_ACCESS_EMAIL` alongside a production audience. Runtime tests use explicit test identities and exercise the deployed Worker/DO code locally with `pnpm exec vitest run test/mcp.test.ts`. The [MCP SDK server documentation](https://ts.sdk.modelcontextprotocol.io/server) covers the official transport used here.

## Implementation validation

The implementation passed 77 tests across 18 files, typecheck, production build, conventions and diff whitespace checks. MCP runtime coverage includes initialization/discovery, commands and shared reads, Activity actor/client attribution, browser broadcasts, token privacy, validation errors, membership revocation (including an in-flight request), and Origin/method checks.

The first full parallel run hit host temporary-storage failures (`SQLITE_IOERR_WRITE`); the complete suite passed serially using a worktree-local temp directory. This is local runtime evidence, not a deployed OAuth acceptance result.
