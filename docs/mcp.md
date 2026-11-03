# Account-level agent MCP endpoint

The first M5 implementation exposes the shared command set over stateless MCP Streamable HTTP at:

```text
https://<pm-host>/api/mcp?client=Claude
```

Register one connection for your account. Each request requires the existing Cloudflare Access identity and an invited Member record. `workspaces.list` returns every Workspace you currently belong to; each Workspace tool checks current D1 membership again using its required `workspaceSlug` argument. New invitations appear without reconnecting, and removing one membership leaves other Workspaces accessible. An existing Member with no remaining memberships receives an empty list. Agents act as the connecting human Member; actor IDs and identity headers supplied by clients cannot select another Member. All commands use the same validation, authorization, synchronous transactions, Activity and WebSocket broadcasts as the app. This endpoint grants the same Workspace permissions as the app, including Project GitHub-token configuration.

## Connect once from T3 Code (Codex)

After a build containing this endpoint is deployed and Managed OAuth is enabled, run these commands on the machine hosting your T3 environment:

```bash
codex mcp add pm --url 'https://pm.maximefilippini.me/api/mcp?client=T3Code'
codex mcp login pm
```

Complete the Access sign-in using your invited email. For a remote terminal, use `codex mcp login pm --no-browser` and follow its printed URL/callback instructions. Use the same `CODEX_HOME` as your T3 Codex provider if customized. Restart the agent session in T3 Code, then ask: “Use PM to list my Workspaces.” This connection covers every Workspace you belong to, including future invitations. See the [official Codex MCP guide](https://learn.chatgpt.com/docs/extend/mcp).

For the shared preview, replace the hostname with `pm-preview.maximefilippini.me`. If replacing a prior Workspace-scoped `pm` registration, remove it with `codex mcp remove pm` before adding the account URL, then authenticate again. The old `/api/w/:slug/mcp` route has been removed.

Example calls through that one connection:

```json
{"name":"workspaces.list","arguments":{}}
{"name":"workspace.snapshot","arguments":{"workspaceSlug":"product"}}
{"name":"search","arguments":{"workspaceSlug":"design","text":"navigation"}}
```

Workspace arguments are required on reads and writes, so an agent working across multiple Workspaces always names its target. If the requested Workspace is unclear, it should ask before making a change.

## Tools and protocol

`tools/list` derives input schemas from `src/shared/commands.ts` and `src/shared/protocol.ts`. Every command is available under its existing name, such as `task.create`, `meeting.recordOutcome` and `comment.edit`. Read tools are `workspaces.list`, `workspace.snapshot`, `search`, `comments.list` and `activity.list`. `ids.generate` creates a UUIDv7 for commands that require new entity IDs. Call `workspaces.list` first, then `workspace.snapshot` with a selected `workspaceSlug` to find existing IDs; Activity and Comments use their existing pagination cursors. Validation and domain failures return MCP tool results with `isError: true` and a JSON error code/message. Protocol failures use the SDK's JSON-RPC errors.

The endpoint supports POST requests with `Content-Type: application/json` and `Accept: application/json, text/event-stream`. It returns JSON responses and retains no MCP session in Worker memory. GET/SSE subscriptions and DELETE sessions are unsupported (405); browser synchronization continues through the existing Workspace WebSockets. Requests with an Origin must match the endpoint origin. Bodies are limited to 128 KiB. Authenticated MCP responses are marked `Cache-Control: no-store`.

The optional `client` query parameter is a self-declared display label used for Activity's `via`, limited to 100 letters/digits/spaces or `._/-`. It defaults to `MCP`. Configure a distinct name for each agent connection. The label is not authenticated identity or a permission boundary. Because transports are stateless, the endpoint does not retain `initialize.clientInfo` for later requests. No tool accepts an actor ID or a separate `via` override. All commands and Workspace queries require `workspaceSlug`; `workspaces.list` and `ids.generate` are account-level tools with no Workspace argument. The server keeps no implicit current Workspace. Entity IDs from one Workspace never select or grant access to another.

Creation commands require caller-supplied IDs and do not promise automatic retry deduplication. After a network error, inspect the snapshot before retrying a creation. Task/Meeting deletion is soft and supports restore. GitHub tokens are write-only and stay out of snapshots and Activity.

## Managed OAuth rollout — still required

The Worker reuses its existing validation of `Cf-Access-Jwt-Assertion` (signature, issuer, audience, expiry and human email). It does not trust an unverified bearer token as identity or implement a separate OAuth authorization server.

Cloudflare's [Managed OAuth documentation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/) describes enabling Managed OAuth for the Access application and forwarding a validated Access JWT to the MCP server. Enable it for the appropriate preview application and confirm the configured `ACCESS_AUD` matches that application's audience. Preserve the existing email allowlist and protect the MCP URL as well as the app. The `/api/*` Worker-first asset rule already covers the endpoint.

Before declaring M5 complete:

1. Enable Managed OAuth in Access for preview, including the Claude connector's permitted redirect/client configuration.
2. Connect Claude to the account endpoint above using OAuth; confirm the browser sign-in resolves to the expected Member and that an uninvited email is denied.
3. Run snapshot/search and a reversible command through that connector. Observe its Activity actor/`via` in the app and the change in a connected browser.
4. Remove that Member from one Workspace and confirm it disappears from discovery, subsequent calls targeting it are denied, and other memberships remain usable; also verify expired/invalid credentials cannot reach tools.
5. Repeat on production only after reviewing the preview results and intended Access application configuration.

This PR does not configure Access, provision credentials, or claim a live Claude OAuth test. If that test demonstrates incompatibility, ADR 0003's fallback is `workers-oauth-provider` with Access upstream. Do not add a second authentication system before that evidence exists.

For local development, use the existing `.dev.vars` identity and `pnpm dev`; never enable `DEV_ACCESS_EMAIL` alongside a production audience. Runtime tests use explicit test identities and exercise the deployed Worker/DO code locally with `pnpm exec vitest run test/mcp.test.ts`. The [MCP SDK server documentation](https://ts.sdk.modelcontextprotocol.io/server) covers the official transport used here.

## Implementation validation

The implementation passed 81 tests across 18 files, typecheck, production build, conventions and diff whitespace checks. MCP runtime coverage includes initialization/discovery, commands and shared reads, Activity actor/client attribution, browser broadcasts, token privacy, validation errors, membership revocation (including an in-flight request), and Origin/method checks. Account-level tests cover discovery visibility, required Workspace selection, identical entity IDs in different Workspaces, concurrent reads, new invitations, and remaining/empty membership lists.

The first full parallel run hit host temporary-storage failures (`SQLITE_IOERR_WRITE`); the complete suite passed serially using a worktree-local temp directory. This is local runtime evidence, not a deployed OAuth acceptance result.
