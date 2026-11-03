# V1 tasks

Work breakdown for [`spec.md`](./spec.md), ordered by milestone (§11). Tick boxes as work lands.

## M0: Deploy pipeline

- [x] Scaffold: single package, Vite + `@cloudflare/vite-plugin`, React SPA, Hono Worker, `wrangler.jsonc`
- [x] D1 database `pm-registry` and Workspace DO binding (`new_sqlite_classes`)
- [x] Custom domain `pm.maximefilippini.me`; `workers_dev` and preview URLs off
- [x] First manual deploy; Access in front of the hostname
- [x] GitHub Actions: typecheck + test on every push/PR, deploy on push to `master` (D1 migrations, then `wrangler deploy`)
- [ ] `CLOUDFLARE_API_TOKEN` repo secret set (account id is in `wrangler.jsonc`)

## M1: Foundation

### Auth (§3)
- [x] Verify `Cf-Access-Jwt-Assertion` with `jose` against the team JWKS (`aud`, `exp`, signature); 401 on failure
- [x] `DEV_ACCESS_EMAIL` dev identity; fail closed (500) when set together with `ACCESS_AUD`
- [x] Resolve email → Member in D1; 403 when not invited
- [x] Membership check for `/api/w/:slug/*`; forward to DO with internal Member header
- [ ] Tests: missing/invalid JWT → 401, non-member → 403, dev+aud → 500

### Registry and admin (§3.5, §6 admin)
- [x] D1 migration: `workspaces`, `members`, `workspace_members`
- [x] `GET /api/me` (Member + their Workspaces + `isAdmin`)
- [ ] `/api/admin`: `workspace.create`, `member.add`, `member.remove`, `member.rename` (ADMIN_EMAILS only)
- [ ] DO RPC to sync the `members` mirror; removing a Member marks inactive and closes their sockets
- [ ] Admin page (Workspaces, Members)
- [ ] Bootstrap: admin can create the first Workspace and add themselves

### Workspace DO and sync (§5, ADR 0002)
- [x] Numbered SQL migrations in the constructor (`meta.schema_version`)
- [ ] Hibernatable sockets: `ctx.acceptWebSocket`, attachment `{memberId, viewing, editing}`, ping/pong auto-response
- [ ] `snapshot` on connect; `cmd` → validate → apply (sync, no await) → Activity → bump `version` → broadcast `change` + `ack`/`reject`
- [ ] `query` messages (`activity.list` first)
- [ ] zod schemas in `src/shared/` for entities, commands, changes, protocol
- [ ] Tests: snapshot on connect, cross-client change, reject, idempotent create, rebuild from storage + attachments (`evictDurableObject`), `ctx.getWebSockets()`
- [ ] Lint rule: no `setTimeout`/`setInterval` in `src/worker/workspace/`

### Projects and Tasks (§4, §6)
- [ ] Commands: `project.create/rename/archive/unarchive`
- [ ] Commands: `task.create/update/setStatus/move` (Task key numbering, `completed_at`, fractional rank)
- [ ] Command tests per entity, including Activity written

### Client
- [ ] Router (TanStack), Zustand store fed by socket, Tailwind + shadcn/ui
- [ ] Sync layer: socket with backoff, ping every 30 s, pending queue, optimistic apply, rollback + toast on reject, replay after reconnect
- [ ] Views: Workspace home (Project list), Project / Tasks (grouped by status, filters, reorder), Task detail (basic), My Tasks
- [ ] Mobile-first layout

### Done when
- [ ] Two browsers see each other's Task edits live
- [ ] DO duration near zero while tabs sit idle (check dashboard metrics)

## M2: Planning
- [ ] Features: `feature.create/update/setStatus`, `decided_by/at`, Features view, Feature detail, "Mark Feature done?" prompt
- [ ] Feature–Task linkage (same Project only; UI suggests accepted)
- [ ] Comments: `comment.create/edit/delete` (author only), `comments.list` query, live changes applied only when loaded
- [ ] Activity feed view (paged `activity.list`) and per-item Activity
- [ ] Presence (viewing/editing) and "changed while you were editing" warning
- [ ] Markdown fields: textarea + live preview, `react-markdown` without HTML, Task keys auto-linked
- [ ] ⌘K quick-jump + `search` query (SQL `LIKE`), mobile search button
- [ ] `manifest.webmanifest` + icons, `display: standalone`
- [ ] `GET /api/w/:slug/export`

## M3: Meetings
- [ ] Topics: `topic.create/update/move/delete` (author only, unresolved only), reorderable list
- [ ] Meetings: `meeting.start/setAttendees/recordOutcome/clearOutcome/close`, one open at a time, carry-over
- [ ] Meeting view: attendees, Outcome boxes, quick "create Feature/Task" prefilling Outcome, Close
- [ ] Past Meetings view + `meeting.get` query
- [ ] Workspace home: next Meeting summary

## M4: GitHub
- [ ] `GITHUB_TOKEN_KEY` secret; AES-GCM encrypt/decrypt; `project.setGithubToken` (clears `fetch_error`s), `hasGithubToken`
- [ ] `pr.link/unlink/refresh`, URL validation, state + error mapping, 5 s timeout, 60 s staleness
- [ ] PR badges on Task detail, "PR merged — mark Done?" prompt
- [ ] Project settings view (rename, archive, token with guidance)
- [ ] Tests: state mapping, error mapping with mocked `fetch`

## M5: Agents (designed, built after v1)
- [ ] MCP server over the command set, Access Managed OAuth (fallback `workers-oauth-provider`), `via` attribution
