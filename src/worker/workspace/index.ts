import { encryptToken, decryptToken } from "./crypto";
import { fetchPullRequest } from "./github";
import { exportWorkspace } from "./export";
import { ZodError } from "zod";
import { DurableObject } from "cloudflare:workers";
import { parseCommand } from "../../shared/commands";
import type { Change, Presence } from "../../shared/entities";
import { ClientMessage, querySchemas, type QueryName, type ServerMessage } from "../../shared/protocol";
import { apply } from "./commands";
import { CommandContext, CommandError } from "./context";
import { activityList, commentsList, search, snapshot } from "./queries";
import { all, one, toPullRequestLink, toMember } from "./rows";
import { migrate } from "./schema";

/** Headers the Worker sets after authenticating. The DO trusts only these (spec §3). */
export const MEMBER_HEADERS = {
  id: "X-PM-Member-Id",
  email: "X-PM-Member-Email",
  name: "X-PM-Member-Name",
} as const;

export type SocketAttachment = Presence;

/**
 * All data for one Workspace (ADR 0001), synced over hibernatable WebSockets (ADR 0002).
 *
 * Hibernation rules (do not break): accept with ctx.acceptWebSocket only; heartbeats via
 * setWebSocketAutoResponse; no timers; per-connection state in socket attachments; keep
 * the constructor cheap. Instance fields must never hold state that matters across wakes.
 */
export class WorkspaceDO extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    migrate(this.sql);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  // ---- WebSocket entry (called by the Worker after auth + membership checks) ----

  async fetch(request: Request): Promise<Response> {
    const memberId = request.headers.get(MEMBER_HEADERS.id);
    if (!memberId) return new Response("Forbidden", { status: 403 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    // The registry is the source of truth for membership; make sure our mirror knows this Member.
    this.ensureMember({
      id: memberId,
      email: request.headers.get(MEMBER_HEADERS.email) ?? "",
      name: decodeURIComponent(request.headers.get(MEMBER_HEADERS.name) ?? ""),
    });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [memberId]);
    server.serializeAttachment({ memberId } satisfies SocketAttachment);
    this.send(server, { type: "snapshot", version: this.version(), memberId, data: snapshot(this.sql) });
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return ws.close(1008, "No identity");

    let parsed: ClientMessage;
    try {
      const result = ClientMessage.safeParse(JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw)));
      if (!result.success) return;
      parsed = result.data;
    } catch {
      return;
    }

    switch (parsed.type) {
      case "cmd":
        return this.handleCommand(ws, attachment.memberId, parsed.id, parsed.name, parsed.args);
      case "query":
        return this.handleQuery(ws, parsed.id, parsed.name, parsed.args);
      case "presence":
        ws.serializeAttachment({ ...attachment, ...(parsed.viewing !== undefined && { viewing: parsed.viewing }), ...(parsed.editing !== undefined && { editing: parsed.editing }) } satisfies SocketAttachment);
        return this.broadcastPresence();
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.serializeAttachment({ memberId: (ws.deserializeAttachment() as SocketAttachment)?.memberId });
    this.broadcastPresence(ws);
    try {
      ws.close(code, "closing");
    } catch {
      // already closed
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.serializeAttachment({ memberId: (ws.deserializeAttachment() as SocketAttachment)?.memberId });
    this.broadcastPresence(ws);
  }

  // ---- Commands ----

  /**
   * Validate, apply all writes in one synchronous transaction, record Activity, bump
   * version, broadcast. Exposed for the future API/MCP surface.
   */
  async execute(actorId: string, via: string | null, name: string, args: unknown, commandId?: string): Promise<
    | { ok: true; version: number; changes: Change[] }
    | { ok: false; error: { code: CommandError["code"]; message: string } }> {
    const parsed = parseCommand(name, args);
    if (!parsed.ok) return { ok: false, error: { code: "invalid", message: parsed.message } };

    const actor = one(this.sql, toMember, "SELECT * FROM members WHERE id = ?", actorId);
    if (!actor?.active) return { ok: false, error: { code: "forbidden", message: "Not an active Member" } };

    try {
      let preparedToken: string | null | undefined;
      if (parsed.command.name === "project.setGithubToken") {
        preparedToken = parsed.command.args.token === null ? null : await encryptToken(parsed.command.args.token, this.env.GITHUB_TOKEN_KEY);
        // Encryption yields; membership may have changed meanwhile.
        if (!one(this.sql, toMember, "SELECT * FROM members WHERE id = ?", actorId)?.active) throw new CommandError("forbidden", "Not an active Member");
      }
      const ctx = new CommandContext(this.sql, actorId, via, Date.now(), preparedToken);
      this.ctx.storage.transactionSync(() => {
        apply(ctx, parsed.command);
        if (ctx.changes.length > 0) this.bumpVersion();
      });
      const version = this.version();
      if (ctx.changes.length > 0) this.broadcast({ type: "change", version, cause: commandId, changes: ctx.changes });
      if (parsed.command.name === "pr.link" || parsed.command.name === "pr.refresh") await this.refreshPullRequests(parsed.command.args.taskId, actorId, via);
      return { ok: true, version: this.version(), changes: ctx.changes };
    } catch (e) {
      if (e instanceof CommandError) return { ok: false, error: { code: e.code, message: e.message } };
      console.error("command failed", name);
      return { ok: false, error: { code: "internal", message: "Something went wrong" } };
    }

  }

  private async refreshPullRequests(taskId: string, actorId: string, via: string | null) {
    const project = this.sql.exec<{ github_token_enc: string | null }>("SELECT p.github_token_enc FROM projects p JOIN tasks t ON t.project_id = p.id WHERE t.id = ? AND t.deleted_at IS NULL", taskId).toArray()[0];
    if (!project) return;
    const encrypted = project.github_token_enc;
    let token: string | null = null;
    let decryptionFailed = false;
    try { if (encrypted) token = await decryptToken(encrypted, this.env.GITHUB_TOKEN_KEY); } catch { decryptionFailed = true; }
    const links = all(this.sql, toPullRequestLink, "SELECT * FROM pull_request_links WHERE task_id = ? AND (fetched_at IS NULL OR fetched_at <= ?)", taskId, Date.now() - 60_000);
    await Promise.all(links.map(async (link) => {
      const result = decryptionFailed ? { title: null, state: null, fetchError: "unavailable" as const } : await fetchPullRequest(link, token);
      this.ctx.storage.transactionSync(() => {
        const current = one(this.sql, toPullRequestLink, "SELECT * FROM pull_request_links WHERE id = ?", link.id);
        const currentProject = this.sql.exec<{ github_token_enc: string | null }>("SELECT p.github_token_enc FROM projects p JOIN tasks t ON t.project_id = p.id WHERE t.id = ? AND t.deleted_at IS NULL", taskId).toArray()[0];
        if (!current || current.createdAt !== link.createdAt || current.fetchedAt !== link.fetchedAt || !currentProject || currentProject.github_token_enc !== encrypted) return;
        const now = Date.now();
        this.sql.exec("UPDATE pull_request_links SET title = ?, state = ?, fetch_error = ?, fetched_at = ? WHERE id = ?",
          result.title ?? current.title, result.state ?? current.state, result.fetchError, now, link.id);
        const ctx = new CommandContext(this.sql, actorId, via, now);
        if (current.state !== result.state || current.fetchError !== result.fetchError) ctx.activity("pr.state", "task", taskId, { url: current.url, state: result.state, error: result.fetchError });
        ctx.emit({ entity: "pullRequestLink", op: "upsert", row: one(this.sql, toPullRequestLink, "SELECT * FROM pull_request_links WHERE id = ?", link.id)! });
        this.bumpVersion();
        this.broadcast({ type: "change", version: this.version(), changes: ctx.changes });
      });
    }));
  }

  private async handleCommand(ws: WebSocket, memberId: string, id: string, name: string, args: unknown) {
    const result = await this.execute(memberId, null, name, args, id);
    this.send(ws, result.ok ? { type: "ack", id } : { type: "reject", id, error: result.error });
  }

  /** Shared reads for authenticated sockets and the Worker's MCP adapter. */
  private readQuery(actorId: string, name: string, args: unknown):
    | { ok: true; data: unknown }
    | { ok: false; error: { code: CommandError["code"]; message: string } } {
    if (!one(this.sql, toMember, "SELECT * FROM members WHERE id = ?", actorId)?.active) {
      return { ok: false, error: { code: "forbidden", message: "Not an active Member" } };
    }
    if (name !== "workspace.snapshot" && !Object.hasOwn(querySchemas, name)) {
      return { ok: false, error: { code: "invalid", message: `Unknown query: ${name}` } };
    }
    try {
      let data: unknown;
      switch (name as QueryName | "workspace.snapshot") {
        case "workspace.snapshot": data = { version: this.version(), memberId: actorId, data: snapshot(this.sql) }; break;
        case "search": data = search(this.sql, querySchemas.search.parse(args ?? {})); break;
        case "activity.list": data = activityList(this.sql, querySchemas["activity.list"].parse(args ?? {})); break;
        case "comments.list": data = commentsList(this.sql, querySchemas["comments.list"].parse(args ?? {})); break;
      }
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: {
        code: error instanceof CommandError ? error.code : error instanceof ZodError ? "invalid" : "internal",
        message: error instanceof CommandError || error instanceof ZodError ? error.message : "Could not load collection",
      } };
    }
  }

  // JSON is the existing wire format. It also keeps open-ended Activity payloads
  // explicit at the RPC boundary rather than pretending unknown data is Rpc.Serializable.
  query(actorId: string, name: string, args: unknown) {
    const response = this.readQuery(actorId, name, args);
    return response.ok ? { ok: true as const, json: JSON.stringify(response.data) } : response;
  }

  async command(actorId: string, via: string, name: string, args: unknown) {
    const response = await this.execute(actorId, via, name, args);
    return { ok: response.ok, json: JSON.stringify(response.ok ? response : response.error) };
  }

  private handleQuery(ws: WebSocket, id: string, name: string, args: unknown) {
    const memberId = (ws.deserializeAttachment() as SocketAttachment).memberId;
    const result = this.readQuery(memberId, name, args);
    this.send(ws, result.ok ? { type: "result", id, data: result.data } : { type: "result_error", id, error: result.error });
  }

  exportData() { return exportWorkspace(this.sql); }

  // ---- Membership mirror (RPC from the Worker's admin endpoints) ----

  upsertMember(member: { id: string; email: string; name: string }): void {
    this.ensureMember(member);
  }

  /** Mark inactive (history keeps their name) and close their sockets. */
  deactivateMember(memberId: string): void {
    const member = one(this.sql, toMember, "SELECT * FROM members WHERE id = ?", memberId);
    if (!member?.active) return;
    this.sql.exec("UPDATE members SET active = 0 WHERE id = ?", memberId);
    this.bumpVersion();
    for (const ws of this.ctx.getWebSockets(memberId)) ws.close(4003, "Removed from Workspace");
    this.broadcast({ type: "change", version: this.version(), changes: [{ entity: "member", op: "upsert", row: { ...member, active: false } }] });
    this.broadcastPresence();
  }

  private ensureMember(member: { id: string; email: string; name: string }): void {
    const existing = one(this.sql, toMember, "SELECT * FROM members WHERE id = ?", member.id);
    const name = member.name || existing?.name || member.email;
    const email = member.email || existing?.email || "";
    if (existing?.active && existing.name === name && existing.email === email) return;
    this.sql.exec(
      `INSERT INTO members (id, email, name, active) VALUES (?, ?, ?, 1)
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, active = 1`,
      member.id, email, name,
    );
    this.bumpVersion();
    this.broadcast({ type: "change", version: this.version(), changes: [{ entity: "member", op: "upsert", row: { id: member.id, email, name, active: true } }] });
  }

  // ---- Helpers ----

  private broadcastPresence(exclude?: WebSocket): void {
    const members = new Map<string, Presence>();
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === exclude || socket.readyState !== WebSocket.OPEN) continue;
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) continue;
      const active = one(this.sql, toMember, "SELECT * FROM members WHERE id = ?", attachment.memberId);
      if (!active?.active || (!attachment.viewing && !attachment.editing)) continue;
      members.set(JSON.stringify([attachment.memberId, attachment.viewing ?? null, attachment.editing ?? null]), attachment);
    }
    this.broadcast({ type: "presence", members: [...members.values()] });
  }

  private version(): number {
    const row = this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = 'version'").toArray()[0];
    return row ? Number(row.value) : 0;
  }

  private bumpVersion(): void {
    this.sql.exec(
      `INSERT INTO meta (key, value) VALUES ('version', '1')
       ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
    );
  }

  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // socket closing; the client will resync on reconnect
    }
  }

  private broadcast(message: ServerMessage): void {
    const data = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        // ignore
      }
    }
  }
}
