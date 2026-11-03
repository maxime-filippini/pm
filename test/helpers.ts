import { env } from "cloudflare:test";
import { uuidv7 } from "../src/shared/ids";
import type { ServerMessage } from "../src/shared/protocol";
import { MEMBER_HEADERS } from "../src/worker/workspace";

export type TestMember = { id: string; email: string; name: string };

export function newMember(name = "Alice"): TestMember {
  return { id: uuidv7(), email: `${name.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}@example.com`, name };
}

export function workspaceStub(workspaceId: string) {
  return env.WORKSPACE.getByName(workspaceId);
}

/** A test client connected straight to the DO, as the Worker would after auth. */
export async function connect(workspaceId: string, member: TestMember) {
  const res = await workspaceStub(workspaceId).fetch("https://do/ws", {
    headers: {
      Upgrade: "websocket",
      [MEMBER_HEADERS.id]: member.id,
      [MEMBER_HEADERS.email]: member.email,
      [MEMBER_HEADERS.name]: encodeURIComponent(member.name),
    },
  });
  if (!res.webSocket) throw new Error(`No socket: ${res.status}`);
  const ws: WebSocket = res.webSocket;
  ws.accept();

  const inbox: ServerMessage[] = [];
  const waiters: Array<() => void> = [];
  ws.addEventListener("message", (e) => {
    if (e.data === "pong") return;
    inbox.push(JSON.parse(e.data as string));
    waiters.splice(0).forEach((w) => w());
  });

  async function next<T extends ServerMessage["type"]>(type: T, match?: (m: Extract<ServerMessage, { type: T }>) => boolean) {
    for (;;) {
      const i = inbox.findIndex((m) => m.type === type && (!match || match(m as Extract<ServerMessage, { type: T }>)));
      if (i >= 0) return inbox.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>;
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2000);
        waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  let seq = 0;
  async function command(name: string, args: unknown) {
    const id = `c${++seq}-${crypto.randomUUID()}`;
    ws.send(JSON.stringify({ type: "cmd", id, name, args }));
    const ack = next("ack", (m) => m.id === id).then((m) => ({ ok: true as const, m }));
    const reject = next("reject", (m) => m.id === id).then((m) => ({ ok: false as const, m }));
    const result = await Promise.race([ack, reject]);
    return { id, ...result };
  }

  async function query(name: string, args: unknown) {
    const id = `q${++seq}`;
    ws.send(JSON.stringify({ type: "query", id, name, args }));
    return next("result", (m) => m.id === id);
  }

  const snapshot = await next("snapshot");
  return { ws, inbox, next, command, query, snapshot, close: () => ws.close() };
}

export function freshWorkspaceId() {
  return uuidv7();
}
