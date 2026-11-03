# Command/change sync over hibernatable WebSockets, last write wins

Clients connect to the Workspace DO over WebSocket. On connect, the client receives a snapshot. After that, the client sends **commands** (e.g. `task.update`), and the DO validates each one, applies it to SQLite, records Activity, and broadcasts the resulting **change** to every connected client. The client applies commands optimistically and reconciles against the broadcast. Conflicts resolve as last write wins per field. The app is online-only, with a small in-memory queue for pending commands across brief reconnects. The same command set will back the API and MCP server, with every command carrying `(actor Member, via agent?)`.

## Considered Options

- **CRDT (Yjs) for co-editing**: rejected. With so few people, two of them typing in the same field at once is rare; presence indicators plus a "changed while you were editing" warning cover it.
- **Agents SDK state sync**: rejected. It syncs whole state blobs, which fits relational data poorly.
- **Replicache/Zero-style sync engine**: rejected. Offline-first rebasing isn't needed.

## Consequences: hibernation rules (do not break these)

Durable Objects bill for wall-clock time while they are kept in memory. A connected DO that never hibernates costs roughly 20× more than one that does. To keep it hibernating:

- Accept sockets only with `ctx.acceptWebSocket()`; never `ws.accept()` or `addEventListener`.
- Heartbeats use `ctx.setWebSocketAutoResponse` (`"ping"`→`"pong"`); never `setInterval`/`setTimeout` in the DO.
- Delayed work uses alarms; no long `waitUntil`, and no outbound WebSockets from the DO.
- Per-connection state (Member id, presence) lives in `ws.serializeAttachment` (≤16 KB), not in instance fields.
- The constructor stays cheap (schema migration only), because it re-runs on every wake.
- The Worker rejects non-upgrade and unauthenticated requests before they reach the DO.
- Tests assert that sockets go through the Hibernation API, and that the DO behaves correctly when rebuilt from only storage and socket attachments (which is what waking from hibernation looks like). After deploy, check the DO's duration metrics in the dashboard.
