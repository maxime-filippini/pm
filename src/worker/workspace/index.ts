import { DurableObject } from "cloudflare:workers";
import { migrate } from "./schema";

export const MEMBER_HEADER = "X-PM-Member-Id";

type Attachment = { memberId: string };

/**
 * All data for one Workspace (ADR 0001), synced over hibernatable WebSockets (ADR 0002).
 * Hibernation rules: acceptWebSocket only, auto-response heartbeats, no timers,
 * per-connection state in attachments, cheap constructor.
 */
export class WorkspaceDO extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => migrate(ctx.storage.sql));
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const memberId = request.headers.get(MEMBER_HEADER);
    if (!memberId) return new Response("Forbidden", { status: 403 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [memberId]);
    server.serializeAttachment({ memberId } satisfies Attachment);
    server.send(JSON.stringify({ type: "snapshot", version: this.version(), data: {} }));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {
    // Command dispatch lands in M1 (spec §5–6).
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code, "closing");
  }

  private version(): number {
    const row = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key = 'version'")
      .toArray()[0];
    return row ? Number(row.value) : 0;
  }
}
