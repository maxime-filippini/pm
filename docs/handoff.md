# Implementation handoff

Status recorded 2026-11-03. Start here when continuing v1 work. [`spec.md`](./spec.md) defines behavior and query contracts; [`tasks.md`](./tasks.md) tracks implementation; [`../CONTEXT.md`](../CONTEXT.md) defines domain terms. Architecture constraints live in [`adr/`](./adr/).

## Where the code stands

Foundation, project-scoped navigation, shadcn/ui, task reordering, per-Project Meetings, Task/Meeting soft deletion with Undo, Features, Feature–Task linkage, and creating Features from meeting Topics are implemented. M3 is implemented ahead of the remaining M2 work.

These PRs were **merged into `master`** on 2026-11-03 (in the order below). Their feature branches have been removed; continue from updated `master`:

| Order | PR | Branch | Base | Change |
|---|---|---|---|---|
| 1 | [#5](https://github.com/maxime-filippini/pm/pull/5) | `feat/project-scoped-navigation` | `master` | Project navigation |
| 2 | [#6](https://github.com/maxime-filippini/pm/pull/6) | `feat/shadcn-ui` | `feat/project-scoped-navigation` | Components and animated reordering |
| 3 | [#7](https://github.com/maxime-filippini/pm/pull/7) | `feat/meetings` | `feat/shadcn-ui` | Topics and Meetings |
| 4 | [#8](https://github.com/maxime-filippini/pm/pull/8) | `feat/soft-delete` | `feat/meetings` | Soft deletion and Undo |
| 5 | [#9](https://github.com/maxime-filippini/pm/pull/9) | `feat/features` | `feat/soft-delete` | Features and meeting proposals |

Current merged baseline: `23dd978` on `master` (merge of #9). This documentation branch is based on that commit and contains only documentation changes. Inspect `git status`, `git log`, and current PR/check state before selecting a base; start new implementation branches from updated `master` or a deliberate newer stack parent.

At the last check, the [CI/deployment run for the merged baseline](https://github.com/maxime-filippini/pm/actions/runs/41625671547) was still in progress. **Merged does not yet establish successful production deployment**; inspect the deploy job before claiming it is live.

Last implementation verification: 47 tests passed, typecheck/build/convention checks passed, and browser flows covered Features, linked Tasks, manual Feature completion, and meeting-created proposals at desktop and 375 px widths. This is a recorded baseline, not the current CI result. The production build still reports a large client bundle (about 672 KB uncompressed / 209 KB gzip). Local dev data includes explicitly named demo Features/Tasks and a closed demo Meeting from browser checks; it is not a clean fixture.

## Execution order and acceptance checks

Keep one reviewable PR per step, following the existing branch/commit conventions in [`../CLAUDE.md`](../CLAUDE.md). Steps 1–3 are the immediate next work. Follow the contracts in spec §5; their new query shapes are planned and still need implementation.

### 1. Comments on Tasks and Features

Implement shared Comment types/changes, command schemas and handlers, `comments.list`, loaded-target client state, and a reusable Comments section on both detail pages. The SQL table already exists; inspect it before adding a migration.

Done when:

- Any Member can post; only the author can edit/delete. Missing targets and deleted Tasks reject new Comments. Bodies are validated and edits show attribution/time.
- Tuple-cursor pagination, idempotent retries, optimistic rollback, and two-client updates work. An unloaded target does not accumulate Comments in memory.
- Query/live-update races preserve the newest state, including deletes; reconnect reloads the collection. Existing Comments return when a deleted Task is restored.
- Runtime tests cover permissions, invalid input, target scoping, pagination ties, and recorded Activity; browser checks cover both detail pages.

### 2. Activity and lasting Restore actions

Extend the existing `activity.list` query to spec §5, add Workspace Activity navigation without disrupting Project tabs, and show target-filtered history on Task and Feature pages. Existing command handlers already write Activity; build on that rather than introducing a second history system.

Done when:

- History shows Member, time, action, and useful target links, with agent `via` attribution when present. Deleted targets render a readable label instead of a broken link.
- Load more uses `(at, id)` cursors and neither drops nor duplicates events sharing a timestamp. Loaded feeds reconcile live changes and reload after reconnect.
- Task/Meeting deletion entries offer Restore after Undo expires, using server-derived current restoration eligibility. Repeated cycles and stale entries behave as specified in spec §5.
- Tests cover target filtering, pagination ties, and restoring after reconnect. A browser check deletes an item, leaves/reopens Activity, and restores it.

### 3. Markdown editing and preview

Use one renderer/editor pattern across Task/Feature descriptions, Comments, Topic bodies, and Outcomes (spec §8). Reuse the current autosave behavior where appropriate.

Done when:

- Textareas have live preview; `react-markdown` renders without raw HTML execution and with safe link handling.
- Task keys become internal links while inline/fenced code and existing Markdown links remain intact. Unknown/deleted references render safely.
- Tests cover rendering safety and link transformation; browser checks cover editing, previews, line breaks, and narrow screens.

### 4. Presence and concurrent-edit warnings

Implement the presence protocol and attachment state from spec §5 and ADR 0002.

Done when two clients show viewing/editing Members; leaving, disconnecting, multiple tabs, and DO reconstruction update presence correctly. A remote field change during a local edit shows “view theirs / keep mine” without discarding the draft. Presence stays out of SQLite and adds no timers in the DO. Test reconstruction and two-client editing.

### 5. Search and quick-jump

Implement spec §5's search contract and §8's dialog, opened by ⌘K/Ctrl+K and a mobile button.

Done when exact Task keys, title matches, Project labels, and destinations work for all three result types. Deleted Tasks and archived Projects are excluded; literal SQL wildcard characters are handled correctly. Keyboard selection, Escape, empty/error states, and mobile opening work. Test ordering, limits, Workspace isolation, and resolved Topic destinations.

### 6. Installation and Workspace export

Add the manifest/icons with standalone display and no service worker (spec §8). Implement the authenticated export route (spec §9).

Done when the manifest and icons load correctly and a Member can download a JSON export containing every DO table, including retained deleted records and Comments/Activity, but excluding the encrypted GitHub token. Test authentication/membership and token exclusion. Document the export format/version and retain table names so future restores can interpret it; export is not an import/restore feature.

### 7. GitHub integration and Project settings

Implement spec §7 and ADR 0004: encrypted per-Project token, PR link/unlink/refresh, cached states, error mapping, badges, and Project settings. Token provisioning requires a secret supplied through the execution environment's private secret mechanism.

Done when tokens are write-only and absent from snapshots, Activity payloads, exports, and logs; PR URLs are validated; fetches have a 5-second timeout and 60-second staleness threshold; failures show the specified states. A Member explicitly confirms “PR merged — mark Done?” rather than completion happening automatically. Mock GitHub responses in tests and verify settings and link states in the browser. Keep network I/O outside synchronous command transactions.

### 8. Real-device and deployment verification

The unchecked items in M0/M1 remain manual verification work:

- Confirm `pm-preview.maximefilippini.me` is in the Access application and requires login. ADR 0005 describes intended configuration, not proof it has been applied.
- Leave two authenticated tabs idle for 30–60 minutes after one edit; inspect the DO's dashboard metrics for that interval. Record the interval and duration/request evidence before ticking the idle-cost checkbox.
- On a real phone, verify taps, native selects, text entry, scrolling, sticky navigation, and reorder buttons. Browser resizing alone does not complete this check.

### 9. Initial bundle size

Add route-based code splitting after the remaining screens settle. Record before/after initial JS size with the same build settings; demonstrate that unopened route code is deferred, normal navigation works, and loading/error states are usable. Keep shared components independent of route modules so imports do not pull entire screens back into the initial bundle.

## Delivery and validation

For behavior changes, run the relevant runtime tests and the repo's typecheck, test, build, and convention checks. Recheck the touched browser flows and a narrow layout. Update the task checklist when implementation passes these checks; record the PR separately from merge/deployment status. Documentation-only edits need link/consistency and diff checks, not new application tests.

Every non-`master` push triggers the **shared** preview deployment; the latest branch wins, including documentation branches. Production deploys only from `master`; inspect the deployment job before claiming a change is live. Follow [`ADR 0005`](./adr/0005-one-shared-preview-environment.md).

M5 (agent MCP server and OAuth) remains after v1. Board views, notifications, offline mode, CRDT editing, full-text search, and GitHub webhooks remain outside this v1 scope.
