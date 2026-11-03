import { parseCommand, type Command } from "../../shared/commands";
import { uuidv7 } from "../../shared/ids";
import type { Ref, Presence } from "../../shared/entities";
import type { ServerMessage } from "../../shared/protocol";
import { useWorkspace, workspaceActions } from "../store/workspace";
import { toast } from "sonner";

const PING_EVERY_MS = 30_000;
const MAX_MISSED_PONGS = 2;

type QueryWaiter = { resolve: (data: unknown) => void; reject: (e: Error) => void };

/**
 * One live connection to a Workspace. Online-only: reconnects with backoff and
 * always takes a fresh snapshot, then resends commands still pending (spec §5).
 */
export class WorkspaceSocket {
  private ws: WebSocket | null = null;
  private presenceState: Omit<Presence, "memberId"> = {};
  private stopped = false;
  private attempt = 0;
  private missedPongs = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private queries = new Map<string, QueryWaiter>();

  constructor(private readonly slug: string) {
    workspaceActions.reset();
    this.open();
  }

  /** Validate, apply optimistically, and send. Returns false if the args are invalid. */
  send<N extends Command["name"]>(name: N, args: Extract<Command, { name: N }>["args"]): boolean {
    const parsed = parseCommand(name, args);
    if (!parsed.ok) {
      toast.error(parsed.message);
      return false;
    }
    const id = uuidv7();
    workspaceActions.addPending({ id, command: parsed.command, at: Date.now() });
    this.transmit({ type: "cmd", id, name, args: parsed.command.args });
    return true;
  }

  presence(patch: { viewing?: Ref | null; editing?: { ref: Ref; field: string } | null }) {
    this.presenceState = { ...this.presenceState, ...patch };
    this.transmit({ type: "presence", ...this.presenceState });
  }

  query<T>(name: string, args: unknown): Promise<T> {
    const id = uuidv7();
    return new Promise<T>((resolve, reject) => {
      this.queries.set(id, { resolve: resolve as (d: unknown) => void, reject });
      if (!this.transmit({ type: "query", id, name, args })) {
        this.queries.delete(id);
        reject(new Error("Offline"));
      }
    });
  }

  close() {
    this.stopped = true;
    this.clearTimers();
    this.ws?.close(1000, "leaving");
  }

  private transmit(message: unknown): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  private open() {
    if (this.stopped) return;
    workspaceActions.setStatus(this.attempt === 0 ? "connecting" : "offline");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/w/${encodeURIComponent(this.slug)}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.missedPongs = 0;
      this.pingTimer = setInterval(() => {
        if (this.missedPongs >= MAX_MISSED_PONGS) return ws.close(4000, "missed pongs");
        this.missedPongs++;
        ws.send("ping");
      }, PING_EVERY_MS);
    };

    ws.onmessage = (e) => {
      if (e.data === "pong") {
        this.missedPongs = 0;
        return;
      }
      this.handle(JSON.parse(e.data as string) as ServerMessage);
    };

    ws.onclose = (e) => {
      this.clearTimers();
      if (this.ws !== ws) return;
      this.ws = null;
      for (const q of this.queries.values()) q.reject(new Error("Disconnected"));
      this.queries.clear();
      if (e.code === 4003) {
        workspaceActions.setStatus("removed");
        return;
      }
      if (this.stopped) return;
      workspaceActions.setStatus("offline");
      const delay = Math.min(10_000, 500 * 2 ** this.attempt) * (0.75 + Math.random() * 0.5);
      this.attempt++;
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
  }

  private handle(message: ServerMessage) {
    switch (message.type) {
      case "presence":
        useWorkspace.setState({ presence: message.members });
        return;
      case "snapshot": {
        workspaceActions.snapshot(message.version, message.memberId, message.data);
        this.transmit({ type: "presence", ...this.presenceState });
        // Resend anything the server may not have seen. Creates are idempotent; updates are LWW.
        for (const p of useWorkspace.getState().pending) {
          this.transmit({ type: "cmd", id: p.id, name: p.command.name, args: p.command.args });
        }
        return;
      }
      case "change":
        return workspaceActions.change(message.version, message.changes);
      case "ack":
        return workspaceActions.removePending(message.id);
      case "reject":
        workspaceActions.removePending(message.id);
        return void toast.error(message.error.message);
      case "result":
      case "result_error": {
        const waiter = this.queries.get(message.id);
        this.queries.delete(message.id);
        if (message.type === "result") waiter?.resolve(message.data);
        else waiter?.reject(new Error(message.error.message));
        return;
      }
    }
  }

  private clearTimers() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.pingTimer = null;
    this.retryTimer = null;
  }
}
