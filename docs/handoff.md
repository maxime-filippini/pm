# Implementation handoff

Status recorded 2026-11-03. Start here when reviewing the v1 implementation stack or continuing verification. [`spec.md`](./spec.md) defines behavior and query contracts; [`tasks.md`](./tasks.md) tracks implementation; [`../CONTEXT.md`](../CONTEXT.md) defines domain terms. Architecture constraints live in [`adr/`](./adr/).

## Current review stack

All remaining v1 code features have been implemented in the stack below, including the additional page headings, explanatory text and section boundaries. Review from the bottom up; every PR targets the preceding branch. None of these PRs was merged by the agent.

| Review order | PR | Branch | Base | Change |
|---|---|---|---|---|
| 1 | [#12](https://github.com/maxime-filippini/pm/pull/12) | `feat/comments` | `master` | Task and Feature Comments |
| 2 | [#13](https://github.com/maxime-filippini/pm/pull/13) | `feat/activity` | `feat/comments` | Activity, tuple pagination, lasting Restore |
| 3 | [#14](https://github.com/maxime-filippini/pm/pull/14) | `feat/markdown` | `feat/activity` | Safe Markdown and live preview |
| 4 | [#15](https://github.com/maxime-filippini/pm/pull/15) | `feat/presence` | `feat/markdown` | Presence and concurrent draft protection |
| 5 | [#16](https://github.com/maxime-filippini/pm/pull/16) | `feat/search` | `feat/presence` | Workspace search and quick-jump |
| 6 | [#17](https://github.com/maxime-filippini/pm/pull/17) | `feat/install-export` | `feat/search` | Installation assets and authenticated export |
| 7 | [#18](https://github.com/maxime-filippini/pm/pull/18) | `feat/github` | `feat/install-export` | GitHub integration and Project settings |
| 8 | [#19](https://github.com/maxime-filippini/pm/pull/19) | `style/page-sections` | `feat/github` | Page explanations and sections |
| 9 | [#20](https://github.com/maxime-filippini/pm/pull/20) | `perf/route-splitting` | `style/page-sections` | Lazy routes and bundle reduction |
| 10 | [#21](https://github.com/maxime-filippini/pm/pull/21) | `fix/sync-polish` | `perf/route-splitting` | Final sync races, deduplication and readable history |
| 11 | [#22](https://github.com/maxime-filippini/pm/pull/22) | `feat/open-layout` | `fix/sync-polish` | Open sections, vertical Task split, row deletion and Workspace return |
| 12 | [#24](https://github.com/maxime-filippini/pm/pull/24) | `feat/responsive-sidebar` | `feat/open-layout` | Desktop sidebar, phone navigation drawer and plain page titles |

Latest navigation refinement ([#24](https://github.com/maxime-filippini/pm/pull/24), stacked on #22): page titles name the view without repeating the Project name. Main content fills the available width, and Task creation sits above the list rather than squeezing it into a narrow column. The desktop sidebar shows one explicitly labeled scope at a time: Project navigation with Back to Workspace, or Workspace navigation with Projects, My Tasks and Activity. Phones carry the same scope in a compact header and accessible modal drawer. Project switching preserves the section. Rename/archive controls remain in Settings. Browser checks at 2000 px, 1280 px, 1024 px and 375 px covered fluid content width, separate navigation scopes, active links, Task detail, switching, Workspace/home return, drawer focus trapping and Escape/focus return, drawer dismissal on navigation and desktop resize, search/keyboard search, and row Delete/Undo. No horizontal overflow was observed in the checked phone views.

Previous design refinement ([#22](https://github.com/maxime-filippini/pm/pull/22)): section boxes are replaced by open spacing and vertical rules. Task creation has its own desktop column; filters and results share Current Tasks. Shared Task rows offer Delete with Undo. Workspace return replaces the cross-Project My Tasks switcher action. Desktop and 375 px browser checks covered these flows, including keyboard reordering.

Final local verification: **70 tests passed**, typecheck, production build, convention and diff checks passed. Browser checks covered Comments, Restore after leaving/reopening Activity, Markdown preview, two-tab concurrent drafts, search keyboard controls, installation assets/export, PR link/unlink and no-token states, settings, named sections and 375 px layouts. GitHub states/errors and token privacy were tested with mocks, not a real credential.

Production-build network checks confirmed unopened route code is deferred. First Home JavaScript fell from about **825 KB to 391 KB** including shared dependencies; see [bundle-size.md](./bundle-size.md) for exact measurements and loading/error recovery checks. This is not a Core Web Vitals score.

At the final CI inspection, PRs #12–#20 had successful check and preview-deploy jobs. #21 was newly pushed; recheck its latest SHA before merging. The shared preview always serves the last deployed branch; individual PR success does not mean that layer is currently served. No production deployment of this stack has been claimed.

### Remaining operational and device checks

- **Private GitHub encryption key**: provision `GITHUB_TOKEN_KEY` separately for preview and production through the private secret mechanism, then a Member can configure a real Project token in settings. No real key or token was provisioned here; see [github.md](./github.md).
- **Real phone**: native selects, taps, text entry, scrolling, sticky navigation, reorder buttons and installation still need an actual device. Resizing to 375 px does not complete this.
- **Idle cost**: two authenticated tabs must sit idle for a recorded 30–60 minute interval, followed by DO duration/request metrics for that interval. Local test sockets and no-timer tests do not establish production idle cost.
- **Preview Access** is now verified: on 2026-11-03 an unauthenticated browser visit to `pm-preview.maximefilippini.me` redirected to this hostname’s Cloudflare Access sign-in page. No dashboard policy edit was needed.
- Review/merge the stack in order, and inspect the resulting production deployment separately. Export is documented in [export.md](./export.md); it is not an import/restore tool.

## Merged foundation (historical baseline)

Foundation, project-scoped navigation, shadcn/ui, task reordering, per-Project Meetings, Task/Meeting soft deletion with Undo, Features, Feature–Task linkage, and creating Features from meeting Topics are implemented. M3 is implemented ahead of the remaining M2 work.

These PRs were **merged into `master`** on 2026-11-03 (in the order below). Their feature branches have been removed; continue from updated `master`:

| Order | PR | Branch | Base | Change |
|---|---|---|---|---|
| 1 | [#5](https://github.com/maxime-filippini/pm/pull/5) | `feat/project-scoped-navigation` | `master` | Project navigation |
| 2 | [#6](https://github.com/maxime-filippini/pm/pull/6) | `feat/shadcn-ui` | `feat/project-scoped-navigation` | Components and animated reordering |
| 3 | [#7](https://github.com/maxime-filippini/pm/pull/7) | `feat/meetings` | `feat/shadcn-ui` | Topics and Meetings |
| 4 | [#8](https://github.com/maxime-filippini/pm/pull/8) | `feat/soft-delete` | `feat/meetings` | Soft deletion and Undo |
| 5 | [#9](https://github.com/maxime-filippini/pm/pull/9) | `feat/features` | `feat/soft-delete` | Features and meeting proposals |

The merged implementation baseline was `23dd978` (merge of #9); the new stack starts from `1c18e1b`, which also includes the merged handoff documentation. Inspect `git status`, `git log`, and current PR/check state before selecting a base; start new implementation branches from updated `master` or a deliberate newer stack parent.

The [master CI/deployment run for `1c18e1b`](https://github.com/maxime-filippini/pm/actions/runs/41626485920) completed successfully. This establishes the foundation deployment only, not deployment of the open implementation stack.

Historical foundation verification: 47 tests passed, typecheck/build/convention checks passed, and browser flows covered Features, linked Tasks, manual Feature completion, and meeting-created proposals at desktop and 375 px widths. This is a recorded baseline, not the current CI result. The production build still reports a large client bundle (about 672 KB uncompressed / 209 KB gzip). Local dev data includes explicitly named demo Features/Tasks and a closed demo Meeting from browser checks; it is not a clean fixture.

## Execution order and acceptance checks

Keep one reviewable PR per step, following the existing branch/commit conventions in [`../CLAUDE.md`](../CLAUDE.md). Steps 1–7 and 9 are implemented in the open review stack above. Step 8 retains the manual checks described above. The acceptance criteria below remain the review checklist; spec §5 defines the implemented query contracts.

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
