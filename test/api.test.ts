import { createExecutionContext, env, runInDurableObject, SELF, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker/index";

const devEnv = (email: string) => ({ ...env, DEV_ACCESS_EMAIL: email, ACCESS_AUD: "" });

async function call(path: string, email: string, init?: RequestInit) {
  const ctx = createExecutionContext();
  const res = await worker.fetch(new Request(`https://pm.test${path}`, init), devEnv(email), ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

const ADMIN = "maxime.filippini@gmail.com";

describe("worker", () => {
  it("serves the health check", async () => {
    expect((await SELF.fetch("https://pm.test/api/health")).status).toBe(200);
  });

  it("returns 401 without an Access token in production mode", async () => {
    expect((await SELF.fetch("https://pm.test/api/me")).status).toBe(401);
  });

  describe("with dev identity", () => {
    let workspaceId: string;

    beforeAll(async () => {
      const res = await call("/api/admin/workspaces", ADMIN, {
        method: "POST",
        body: JSON.stringify({ slug: "team", name: "Team" }),
      });
      workspaceId = ((await res.json()) as { workspace: { id: string } }).workspace.id;
      await call(`/api/admin/workspaces/${workspaceId}/members`, ADMIN, {
        method: "POST",
        body: JSON.stringify({ email: "member@example.com", name: "Member" }),
      });
    });

    it("authenticates export, checks membership and omits encrypted tokens while retaining deleted data", async () => {
      expect((await SELF.fetch("https://pm.test/api/w/team/export")).status).toBe(401);
      expect((await call("/api/w/team/export", "stranger@example.com")).status).toBe(403);
      expect((await call("/api/w/team/export", ADMIN)).status).toBe(403);
      await runInDurableObject(env.WORKSPACE.getByName(workspaceId), (_, state) => {
        state.storage.sql.exec("INSERT INTO projects (id, key, name, github_token_enc, created_at, created_by) VALUES ('export-project', 'EXP', 'Export', 'encrypted-test-fixture', 1, 'actor')");
        state.storage.sql.exec("INSERT INTO tasks (id, project_id, number, title, status, rank, created_by, created_at, updated_at, deleted_at) VALUES ('export-task', 'export-project', 1, 'Deleted', 'todo', 'a0', 'actor', 1, 1, 2)");
      });
      const response = await call("/api/w/team/export", "member@example.com");
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(response.headers.get("Content-Disposition")).toContain("attachment");
      const data = await response.json() as { formatVersion: number; tables: Record<string, Record<string, unknown>[]> };
      expect(data.formatVersion).toBe(1);
      expect(Object.keys(data.tables).some((name) => name.startsWith("__"))).toBe(false);
      expect(data.tables.tasks).toContainEqual(expect.objectContaining({ id: "export-task", deleted_at: 2 }));
      expect(Object.keys(data.tables)).toEqual(expect.arrayContaining(["_schema", "meta", "comments", "activity", "meetings", "meeting_attendees"]));
      expect(JSON.stringify(data)).not.toContain("encrypted-test-fixture");
      expect(JSON.stringify(data)).not.toContain("github_token_enc");
    });

    it("forbids admin routes to non-admins", async () => {
      expect((await call("/api/admin/workspaces", "member@example.com")).status).toBe(403);
    });

    it("lists the Member's Workspaces on /api/me", async () => {
      const me = (await (await call("/api/me", "MEMBER@example.com")).json()) as { workspaces: Array<{ slug: string }> };
      expect(me.workspaces.map((w) => w.slug)).toContain("team");
    });

    it("returns 403 to an uninvited email on the socket route", async () => {
      const res = await call("/api/w/team/ws", "stranger@example.com", { headers: { Upgrade: "websocket" } });
      expect(res.status).toBe(403);
    });

    it("returns 426 to a Member without an upgrade", async () => {
      expect((await call("/api/w/team/ws", "member@example.com")).status).toBe(426);
    });

    it("opens a socket for a Member and mirrors them into the Workspace", async () => {
      const res = await call("/api/w/team/ws", "member@example.com", { headers: { Upgrade: "websocket" } });
      expect(res.status).toBe(101);
      res.webSocket!.accept();
      const snapshot = await new Promise<{ data: { members: Array<{ email: string }> } }>((resolve) =>
        res.webSocket!.addEventListener("message", (e) => resolve(JSON.parse(e.data as string))),
      );
      expect(snapshot.data.members.map((m) => m.email)).toContain("member@example.com");
    });

    it("ignores identity headers sent by the client", async () => {
      const res = await call("/api/w/team/ws", "stranger@example.com", {
        headers: { Upgrade: "websocket", "X-PM-Member-Id": "spoofed" },
      });
      expect(res.status).toBe(403);
    });
  });
});
