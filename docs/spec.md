# Spec: v1

A small, multiplayer project-management app for a Workspace of a few Members. Domain terms are defined in [`CONTEXT.md`](../CONTEXT.md). Architecture decisions are in [`docs/adr/`](./adr/).

This spec describes the target v1 behavior; it does not imply every feature is implemented. See [`tasks.md`](./tasks.md) for implementation status and [`handoff.md`](./handoff.md) for the next steps and verification criteria.

## 1. Goals and non-goals

**Goals**
- Agree on Features, split them into Tasks, and assign them.
- Collect Topics between irregular Meetings, and record their Outcomes.
- Link Tasks to GitHub pull requests and show each PR's state.
- Sync live: every connected Member sees every change within about a second.
- Work well on a phone, and be installable to the home screen.
- Keep the architecture simple: one Worker, one Durable Object per Workspace, and D1 for the registry only.

**Non-goals for v1**: board/kanban view, notifications (email or push), offline mode, real-time co-editing of text (CRDTs), priority/due-date/label fields, full-text search, GitHub webhooks and auto-linking, and the MCP/API (milestone 5, designed for now but built later).

## 2. Stack

| Layer | Choice |
|---|---|
| Hosting | One Cloudflare Worker on `pm.maximefilippini.me`; `workers.dev` and preview URLs disabled. Feature branches deploy to a separate `pm-preview` Worker ([ADR 0005](./adr/0005-one-shared-preview-environment.md)) |
| Auth | Cloudflare Access (email allowlist) in front of the hostname; the Worker verifies the Access JWT ([ADR 0003](./adr/0003-cloudflare-access-as-sole-authentication.md)) |
| Worker routing | Hono |
| Workspace data | One SQLite-backed Durable Object per Workspace ([ADR 0001](./adr/0001-one-durable-object-per-workspace.md)), raw SQL plus numbered migrations |
| Registry | D1 (Workspaces, Members, memberships) |
| Sync | Hibernatable WebSockets, command/change protocol ([ADR 0002](./adr/0002-command-sync-over-hibernatable-websockets.md)) |
| Client | React SPA, TanStack Router, Zustand, Tailwind, shadcn/ui; served as Worker static assets |
| Shared | TypeScript + zod schemas for every command, change and snapshot |
| Build | Vite + `@cloudflare/vite-plugin`, single package |
| Tests | Vitest + `@cloudflare/vitest-plugin` |
| JWT verification | `jose` against the Access team JWKS |

### Repository layout

```
src/
  shared/            # zod schemas: entities, commands, changes, protocol messages
  worker/
    index.ts         # Hono app: /api/*, WebSocket upgrade, admin
    auth.ts          # Access JWT verification, dev identity
    registry.ts      # D1 queries
    workspace/       # the Durable Object
      index.ts       # class WorkspaceDO: socket handlers, dispatch
      schema.ts      # numbered SQL migrations
      commands/      # one file per entity: validation + apply + Activity
      queries.ts     # snapshot, comments, activity, search
      github.ts      # PR state fetch
      crypto.ts      # GitHub token encryption
  client/
    main.tsx
    routes/
    store/           # Zustand store fed by the socket
    sync/            # socket, pending-command queue, optimistic apply
    components/
migrations/          # D1 SQL migrations
public/              # manifest.webmanifest, icons
wrangler.jsonc
```

### Configuration

- Bindings: `DB` (D1), `WORKSPACE` (DO, `new_sqlite_classes: ["WorkspaceDO"]`), `ASSETS`.
- Assets: `not_found_handling: "single-page-application"`, `run_worker_first: ["/api/*"]`.
- Vars: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `ADMIN_EMAILS` (comma-separated).
- Secrets: `GITHUB_TOKEN_KEY` (AES-GCM key for encrypting Project GitHub tokens).
- Dev only: `DEV_ACCESS_EMAIL` in `.dev.vars`. If this is set while `ACCESS_AUD` is also set, the Worker refuses every request with a 500, so it can never be active in production.

## 3. Auth and identity

1. Access gates the whole hostname. Static assets are protected at the edge.
2. For every `/api/*` request, the Worker verifies `Cf-Access-Jwt-Assertion` (signature, `aud`, `exp`) and reads `email`. If verification fails, it returns 401.
3. The Worker resolves `email` to a Member in D1. If there's no Member, it returns 403 ("not invited").
4. For Workspace-scoped routes, the Worker checks the membership, then forwards to the DO with the Member's id in an internal header. **The DO trusts only that header**, and it can only be reached through the Worker.
5. Admins (`ADMIN_EMAILS`) can open `/admin` to create Workspaces and add or remove Members.

Agents (milestone 5) will use Access Managed OAuth and resolve to the connecting Member, with `via` set to the MCP client's name.

## 4. Data model

IDs are client-generated UUIDv7 strings, which makes retried creates idempotent. Timestamps are integer milliseconds since the epoch. `rank` is a fractional-index string used for manual ordering.

### D1 (registry)

```sql
workspaces        (id TEXT PK, slug TEXT UNIQUE, name TEXT, created_at INT)
members           (id TEXT PK, email TEXT UNIQUE COLLATE NOCASE, name TEXT, created_at INT)
workspace_members (workspace_id TEXT, member_id TEXT, added_at INT, PK(workspace_id, member_id))
```

### Workspace DO (SQLite)

```sql
meta        (key TEXT PK, value TEXT)                -- schema_version, workspace_id, version (change counter)
members     (id TEXT PK, email TEXT, name TEXT, active INT)   -- mirror of D1 membership; inactive members keep history

projects    (id TEXT PK, key TEXT UNIQUE, name TEXT, next_task_number INT,
             github_token_enc TEXT NULL, archived_at INT NULL, created_at INT, created_by TEXT)

features    (id TEXT PK, project_id TEXT, title TEXT, description TEXT,
             status TEXT CHECK (status IN ('proposed','accepted','rejected','done')),
             decided_by TEXT NULL, decided_at INT NULL,
             created_by TEXT, created_at INT, updated_at INT)

tasks       (id TEXT PK, project_id TEXT, number INT, feature_id TEXT NULL,
             title TEXT, description TEXT,
             status TEXT CHECK (status IN ('todo','in_progress','done','canceled')),
             assignee_id TEXT NULL, rank TEXT,
             created_by TEXT, created_at INT, updated_at INT, completed_at INT NULL,
             deleted_at INT NULL, deleted_by TEXT NULL,
             UNIQUE(project_id, number))

comments    (id TEXT PK, target_type TEXT CHECK (target_type IN ('feature','task')), target_id TEXT,
             author_id TEXT, via TEXT NULL, body TEXT, created_at INT, edited_at INT NULL)

pull_request_links (id TEXT PK, task_id TEXT, url TEXT, owner TEXT, repo TEXT, number INT,
             title TEXT NULL, state TEXT NULL CHECK (state IN ('draft','open','merged','closed')),
             fetched_at INT NULL, fetch_error TEXT NULL,   -- 'no_token' | 'unauthorized' | 'not_found' | 'unavailable'
             created_by TEXT, created_at INT, UNIQUE(task_id, url))

topics      (id TEXT PK, project_id TEXT, title TEXT, body TEXT, ref_type TEXT NULL, ref_id TEXT NULL, rank TEXT,
             author_id TEXT, created_at INT,
             outcome TEXT NULL, resolved_in_meeting_id TEXT NULL, resolved_at INT NULL)

meetings    (id TEXT PK, project_id TEXT, started_at INT, started_by TEXT, ended_at INT NULL, ended_by TEXT NULL,
             deleted_at INT NULL, deleted_by TEXT NULL)
meeting_attendees (meeting_id TEXT, member_id TEXT, PK(meeting_id, member_id))

activity    (id TEXT PK, at INT, actor_id TEXT, via TEXT NULL, kind TEXT,
             target_type TEXT, target_id TEXT, data TEXT)  -- data: JSON (e.g. {field, from, to})
```

### Domain rules

- **Project key**: 2–6 uppercase letters, unique within the Workspace, and fixed after creation. Projects can be archived and unarchived, never deleted. Archived Projects are hidden from navigation but keep all their data.
- **Task key** = `{project.key}-{task.number}`. The number comes from `next_task_number`, inside the same transaction as the insert.
- **Feature status**: any status may change to any other, but each change is recorded in Activity. Moving to `accepted` or `rejected` sets `decided_by` and `decided_at`. `done` is only ever set by a Member. When the last open Task of an `accepted` Feature reaches `done`/`canceled`, the Feature shows a "Mark Feature done?" prompt.
- **Feature/Task linkage**: a Task may reference a Feature only from the same Project. Any Feature status is allowed, but the UI suggests accepted ones.
- **Task status**: moving to `done` sets `completed_at`, and moving away from it clears it.
- **No hard delete** for Features, Tasks or Projects. Tasks and Meetings can be **soft deleted** (hidden everywhere, restorable): a deleted Task keeps its number, and deleting a Meeting closes it if open and puts the Topics resolved in it back on the agenda (restoring puts their Outcomes back unless they were resolved again since). Comments can be edited and deleted by their author only. Topics can be edited by anyone, and deleted only by their author while unresolved.
- **Meetings**: Topics and Meetings belong to a Project. At most one open Meeting (`ended_at IS NULL`) per Project. While a Meeting is open, its agenda is every unresolved Topic of that Project, including ones added during it. Recording an Outcome resolves the Topic within the open Meeting. An Outcome can only be recorded while a Meeting is open, and can be cleared again before it closes. Attendees default to all active Members when the Meeting starts. Closing a Meeting leaves Topics without an Outcome unresolved, so they carry over. A Topic may reference a Task in the same Project. Topics resolved in a closed Meeting are read-only.
- **Pull Request links**: a URL must match `https://github.com/{owner}/{repo}/pull/{number}`. A Task can have several, and the same PR can be linked to several Tasks.

## 5. Sync protocol

All messages are JSON and validated with zod on both ends.

### Connection

`GET /api/w/:slug/ws` (Upgrade). The Worker authenticates, checks membership, rejects anything that isn't an upgrade (426), then forwards to `WORKSPACE.getByName(workspaceId)`. The DO calls `ctx.acceptWebSocket(ws, [memberId])` and stores `{memberId, viewing, editing}` with `serializeAttachment`. Heartbeats use `setWebSocketAutoResponse("ping" → "pong")`. The client sends `"ping"` every 30 s and reconnects with backoff after missing two pongs.

### Server → client

```ts
{ type: "snapshot", version, memberId, data: { members, projects, features, tasks, pullRequestLinks, topics, meetings } }
{ type: "change",   version, cause?: commandId, changes: Array<{ entity, op: "upsert" | "delete", row }> }
{ type: "ack",      id: commandId }
{ type: "reject",   id: commandId, error: { code, message } }
{ type: "result",   id: queryId, data }
{ type: "result_error", id: queryId, error: { code, message } }
{ type: "presence", members: Array<{ memberId, viewing?: Ref, editing?: { ref: Ref, field: string } }> }
```

- The snapshot contains everything except Comments and Activity. Those are loaded on demand with queries, and their live `change` messages go to all clients, which apply them only if already loaded.
- `version` is a per-Workspace counter incremented on every applied command. The client uses it only to discard stale messages. A reconnect always takes a fresh snapshot (online-only).
- `github_token_enc` is never sent. Projects expose `hasGithubToken: boolean` instead.

### Client → server

```ts
{ type: "cmd",      id, name, args }      // see §6
{ type: "query",    id, name, args }      // comments.list, activity.list, search
{ type: "presence", viewing?: Ref, editing?: { ref, field } | null }
```

### Client behaviour

- Each command is applied optimistically to the store and added to a pending queue, then removed on `ack`. On `reject`, the optimistic change is rolled back and a toast is shown.
- On reconnect, the client takes the fresh snapshot, re-applies still-pending commands on top of it, and resends them. Creates are idempotent by id, and updates are last write wins.
- **"Changed while you were editing"**: when a field editor opens, it remembers the field's value. If a `change` for that field arrives from someone else, the editor shows "{name} changed this: view theirs / keep mine".
- Presence: avatars on items people are viewing, and an "editing…" marker on fields. Presence is held only in socket attachments and broadcast on change. It is never stored.

### Query contracts

Comments, Activity and search implement the contracts below. Activity retains the legacy timestamp-only `before` argument for compatibility; new views use tuple cursors. Query failures use `result_error` with the request id, rather than command `reject` messages.

- **Comment target**: `{ type: "task" | "feature", id: string }`. The target must exist in this Workspace and a Task must not be soft deleted. Comments on a deleted Task are retained but hidden until it is restored. Create/edit bodies are trimmed, nonempty, and limited to 20,000 characters. Any Member may create; only the author may edit/delete. Repeated creates/deletes are idempotent.
- **`comments.list`**: `{ target, cursor?: { createdAt, id }, limit?: number }` → `{ items: Comment[], nextCursor: { createdAt, id } | null }`. Default limit 50, range 1–200. Order by `(created_at ASC, id ASC)` and return rows strictly after the cursor. Fetch one extra row to determine `nextCursor`. The UI appends older-to-newer pages and offers Load more.
- **`activity.list`**: `{ target?: { type, id }, cursor?: { at, id }, limit?: number }` → `{ items: Activity[], nextCursor: { at, id } | null }`. Default limit 50, range 1–200. No target means the whole Workspace; a target filters both `target_type` and `target_id`. Target types are `project`, `feature`, `task`, `topic`, or `meeting`. Order by `(at DESC, id DESC)` and return rows strictly before the cursor. Retain the old `before` argument during migration, but use the tuple cursor in new UI; reject requests supplying both. Deleted targets remain queryable for history and restoration. A page must not skip rows sharing a timestamp.
- **`search`**: `{ text: string, limit?: number }` → `{ items: SearchResult[] }`. Trim text; require 1–200 characters. Default limit 20, range 1–50. Search this Workspace's non-archived Projects for Tasks, Features, and Topics. Exclude soft-deleted Tasks and Topics whose resolved Meeting is deleted. Include both unresolved and resolved Topics. Match Task keys case-insensitively and titles using SQL `LIKE`, binding parameters and escaping literal `%`, `_`, and the escape character. Rank an exact Task key first, then title prefixes, then other title matches; break ties by type and id. Results are capped, with no pagination in v1.
- **Search result**: `{ type: "task" | "feature" | "topic", id, title, projectId, projectKey, taskNumber?: number, meetingId?: string | null }`. Task results open Task detail; Feature results open Feature detail; unresolved Topic results open that Project's Meetings page and focus the Topic. Resolved Topic results open the current Meeting or its past detail as appropriate. Search is Workspace-wide even when opened inside a Project; show the Project key on each result.

For Comments and Activity, apply live changes only to loaded collections, upsert/delete by id, and preserve pagination boundaries. A query response must not overwrite a newer live edit/delete received while it was in flight. Refresh loaded collections after reconnect; pending commands are re-applied through the existing sync mechanism.

### Restore after Undo expires

The 8-second Undo toast and `task.restore` / `meeting.restore` already exist. The Activity view will provide a lasting Restore action on `task.deleted` and `meeting.deleted` entries; a separate Trash view is outside v1. Any Workspace Member may restore. Successful restore refreshes the affected view and history; already-restored commands are harmless. Older deletion entries must not offer Restore when a newer restore/deletion supersedes them: determine the latest deletion/restoration event for the target rather than relying on a possibly unloaded page. Extend deletion items in the query response with server-derived `canRestore: boolean`, separate from the stored Activity event, and refresh eligibility after live delete/restore changes.

Restored Meetings stay closed. Their saved Outcomes return only for Topics still unresolved; later resolutions are preserved. Tasks and Features created during a deleted Meeting are retained. Deleted Tasks retain their numbers and their Comments and Feature linkage. Test repeated deletion/restoration cycles and Restore after a reconnect.

## 6. Commands

Every command runs as `(actor: Member, via?: string, args)`. It validates, then applies all its SQL writes in one synchronous block with no `await` in between. It appends Activity, bumps `version`, and broadcasts. This exact set will back the MCP server later.

| Command | Args | Notes |
|---|---|---|
| `project.create` | `id, key, name` | |
| `project.rename` | `id, name` | |
| `project.archive` / `project.unarchive` | `id` | |
| `project.setGithubToken` | `id, token \| null` | Encrypted with `GITHUB_TOKEN_KEY`; write-only. Clears `fetch_error`s on that Project's PR links |
| `feature.create` | `id, projectId, title, description?` | status `proposed` |
| `feature.update` | `id, title?, description?` | |
| `feature.setStatus` | `id, status` | |
| `task.create` | `id, projectId, title, description?, featureId?, assigneeId?, status?, rank?` | assigns `number`; default rank = end of list |
| `task.update` | `id, title?, description?, featureId?, assigneeId?` | |
| `task.setStatus` | `id, status` | |
| `task.move` | `id, rank` | |
| `comment.create` | `id, target: Ref, body` | |
| `comment.edit` / `comment.delete` | `id, body?` | author only |
| `pr.link` | `id, taskId, url` | triggers a fetch |
| `pr.unlink` | `id` | |
| `pr.refresh` | `taskId` | sent by the client when a Task detail opens; fetches only links with `fetched_at` older than 60 s |
| `task.delete` / `task.restore` | `id` | soft delete |
| `topic.create` | `id, projectId, title, body?, ref?` | `ref` is `{ type: "task", id }` in the same Project |
| `topic.update` | `id, title?, body?, ref?` | |
| `topic.move` | `id, rank` | |
| `topic.delete` | `id` | author only, unresolved only |
| `meeting.start` | `id, projectId` | rejected if the Project already has an open Meeting; attendees default to all active Members |
| `meeting.setAttendees` | `id, memberIds` | |
| `meeting.recordOutcome` | `topicId, outcome` | open Meeting only |
| `meeting.clearOutcome` | `topicId` | open Meeting only, Topic resolved in this Meeting |
| `meeting.createTask` | `topicId, taskId, title, assigneeId?` | open Meeting only; creates the Task and appends "Created WEB-12 for Alice" to the Topic's Outcome in one transaction |
| `meeting.createFeature` | `topicId, featureId, title, description?` | open Meeting only; proposes a Feature and records it in the Outcome atomically |
| `meeting.close` | `id` | |
| `meeting.delete` / `meeting.restore` | `id` | soft delete; see domain rules |

Admin operations (`workspace.create`, `member.add`, `member.remove`, `member.rename`) are Worker HTTP endpoints under `/api/admin`. They write to D1 and then call an RPC method on the DO to update its `members` mirror. Removing a Member marks them inactive and closes their sockets.

## 7. GitHub

See [ADR 0004](./adr/0004-pull-request-links-are-manual-and-polled.md).

- The DO calls `GET https://api.github.com/repos/{owner}/{repo}/pulls/{number}` with the Project's decrypted token (`Authorization: Bearer`, `User-Agent`, a 5 s `AbortSignal.timeout`).
- State mapping: `merged_at` set → `merged`, otherwise `state = closed` → `closed`, otherwise `draft` → `draft`, otherwise `open`. The PR title is stored too.
- If the Project has no token, the call is skipped and the link shows `no_token`. A 401 or 403 shows `unauthorized` ("GitHub token expired or lacks access"), a 404 shows `not_found`, and anything else shows `unavailable`.
- Token guidance shown in Project settings: a fine-grained personal access token scoped to the Project's repositories, with **Pull requests: read** and **Metadata: read**. One token covers a single GitHub owner.
- Merging a PR never changes a Task. When every linked PR of a Task is `merged` and the Task isn't `done`, the Task shows a "PR merged — mark Done?" prompt.

## 8. Views

All views are responsive and work on a phone first. Use open sections, spacing and vertical separators instead of surrounding each zone with a box. Main content uses the width available beside the sidebar, without a centered page-width cap. Task creation sits above the current-task view as its own section, giving both zones the full content width; compact controls may share a row where that helps. Filters and results belong to the same current-task section. Page headings name the view (Tasks, My Tasks, Features); Project context belongs in navigation rather than being repeated in each heading.

- **Workspace home**: list of Projects, each with its open Task count, Topics to discuss, and whether a Meeting is in progress.
- **Project / Tasks**: list grouped by status, sortable by hand (drag on desktop, "move up/down" on mobile), with filters for status, assignee and Feature. Each Task row offers soft deletion with Undo.
- **Navigation**: at widths of 1024 px and above, a full-height sidebar shows one scope at a time. Project view contains the selected Project’s switcher and Tasks / My Tasks / Features / Meetings / Settings links, plus Back to Workspace. Workspace view contains Projects, Workspace-wide My Tasks and Activity; Members open Projects from the Project list. Both scopes have an explicit view label. Narrower screens use a compact sticky header with the current view label and context, search and a menu button opening a modal navigation drawer. The drawer supports keyboard focus, Escape and close controls, closes after navigation, and dismisses when resizing to desktop. Switching Projects preserves the current section. Back to Workspace returns to the Project list; the PM logo returns to the main page. Task detail links include the Project key.
- **My Tasks**: the Project view shows Tasks assigned to me in that Project, excluding `done` and `canceled` by default. A separate Workspace-wide view remains available at `/w/:slug/me` and from Workspace navigation; it groups Tasks by active Project.
- **Features**: per Project, `proposed` first, then `accepted` with Task progress (n/m done), then `done` and `rejected` collapsed.
- **Feature detail**: description, status controls (with who decided and when), Tasks, Comments, Activity.
- **Task detail**: key, title, description, status, assignee, Feature, Pull Request links with state badges, Comments, Activity.
- **Topics / Meeting** (a Project section): an unresolved Topic list you can reorder, with "Start Meeting". During a Meeting: attendee toggles, each Topic with an Outcome box, its related Task's status and assignee, a quick "create Task" (title + assignee, noted in the Outcome), and "Close Meeting". "Create Feature" proposes a Feature using the Topic details and records it in the Outcome.
- **Past Meetings** (under the Project's Meetings section): date, attendees, Topics and their Outcomes.
- **Activity**: a feed for the whole Workspace, paged with `activity.list`.
- **⌘K quick-jump**: jump to a Task by key, or search Tasks, Features and Topics by title with SQL `LIKE`. On mobile, a search button opens the same dialog.
- **Project settings**: rename, archive, GitHub token (write-only field).
- **Admin** (admins only): Workspaces and Members.
- **Installable**: `manifest.webmanifest` with icons and `display: standalone`. No service worker.

Markdown fields (descriptions, Comments, Topic bodies, Outcomes) use a textarea with a live preview. Rendering uses `react-markdown` with HTML disabled. A Task key written in text (`WEB-12`) is shown as a link.

## 9. Export and backup

- `GET /api/w/:slug/export` (any Member) returns a JSON dump of every DO table except `github_token_enc`.
- For recovery, use Durable Object SQLite point-in-time recovery (30 days).

## 10. Testing

Vitest with `@cloudflare/vitest-plugin`:
- **Commands**: one test file per entity, covering validation, domain rules (§4), and the Activity each command writes.
- **Sync**: a socket connects and receives the snapshot. One client's command reaches another client as a `change`. A reject rolls back. A create retried with the same id is a no-op.
- **Hibernation**: sockets are accepted through `ctx.acceptWebSocket` (`ctx.getWebSockets()` returns them). A fresh DO instance rebuilt from only storage and attachments serves commands and presence correctly. No `setTimeout`/`setInterval` in `src/worker/workspace/` (enforced by `test/no-timers.test.ts`).
- **Auth**: an invalid or missing JWT gets a 401, a non-member gets a 403, and `DEV_ACCESS_EMAIL` together with `ACCESS_AUD` fails closed.
- **GitHub**: state mapping and error mapping, with `fetch` mocked.

## 11. Milestones

1. **Foundation**: scaffold (Vite, Worker, wrangler config), Access JWT verification and dev identity, D1 registry and admin page, Workspace DO with migrations and hibernatable sync, Projects and Tasks (create, edit, status, assign, reorder), the Project list and My Tasks views, deploy to `pm.maximefilippini.me` behind Access.
   *Done when*: two browsers see each other's Task edits live, and the DO shows near-zero duration while tabs sit idle.
2. **Planning**: Features and their lifecycle, Feature–Task linkage, Comments, Activity feed, presence and the "changed while editing" warning, ⌘K, installable manifest, export.
3. **Meetings**: Topics, the Meeting flow, Outcomes and carry-over, past Meetings.
4. **GitHub**: Project token setting, Pull Request links, state refresh, the merged-PR prompt.
5. **Agents**: an MCP server over the same command set, with Access Managed OAuth (test Claude's connector first; fall back to `workers-oauth-provider`) and `via` attribution.

## 12. Later (not committed)

A board view, a 👍 per Member on Features, notifications, full-text search (FTS5), GitHub webhooks, and real-time co-editing for long text.
