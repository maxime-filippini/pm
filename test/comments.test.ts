import { describe, expect, it } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import { uuidv7 } from "../src/shared/ids";
import type { CommentsPage } from "../src/shared/protocol";
import { connect, freshWorkspaceId, newMember, workspaceStub } from "./helpers";

async function setup() {
  const wsId = freshWorkspaceId(), member = newMember();
  const alice = await connect(wsId, member), bob = await connect(wsId, newMember("Bob"));
  const projectId = uuidv7(), taskId = uuidv7(), featureId = uuidv7();
  await alice.command("project.create", { id: projectId, key: "WEB", name: "Web" });
  await alice.command("task.create", { id: taskId, projectId, title: "Task" });
  await alice.command("feature.create", { id: featureId, projectId, title: "Feature" });
  const target = { type: "task" as const, id: taskId };
  const list = async (args = {}) => (await alice.query("comments.list", { target, ...args })).data as CommentsPage;
  return { wsId, member, alice, bob, taskId, featureId, target, list };
}
describe("Comments", () => {
  it("attributes agent posts and returns correlated errors for invalid queries", async () => {
    const { wsId, member, alice, target, list } = await setup();
    const id = uuidv7();
    const result = await workspaceStub(wsId).execute(member.id, "Assistant", "comment.create", { id, target, body: "Via agent" });
    expect(result.ok).toBe(true);
    expect((await list()).items[0]).toMatchObject({ authorId: member.id, via: "Assistant" });
    const activity = JSON.stringify((await alice.query("activity.list", {})).data);
    expect(activity).toContain("Assistant");
    for (const args of [{ target, limit: 0 }, { target, cursor: { createdAt: "bad", id } }, { target: { type: "meeting", id } }]) {
      const qid = uuidv7();
      alice.ws.send(JSON.stringify({ type: "query", id: qid, name: "comments.list", args }));
      expect((await alice.next("result_error", (m) => m.id === qid)).error.code).toBe("invalid");
    }
  });

  it("syncs Member comments, enforces authorship, trims bodies and records Activity", async () => {
    const { alice, bob, target, list } = await setup();
    const id = uuidv7();
    const result = await alice.command("comment.create", { id, target, body: "  Hello  " });
    expect(result.ok).toBe(true);
    const change = await bob.next("change", (m) => m.cause === result.id);
    expect(change.changes).toContainEqual(expect.objectContaining({ entity: "comment", row: expect.objectContaining({ body: "Hello" }) }));
    expect((await bob.command("comment.edit", { id, body: "No" })).ok).toBe(false);
    expect((await bob.command("comment.delete", { id })).ok).toBe(false);
    expect((await alice.command("comment.edit", { id, body: " Updated " })).ok).toBe(true);
    expect((await list()).items[0]).toMatchObject({ body: "Updated", editedAt: expect.any(Number) });
    await bob.command("comment.create", { id: uuidv7(), target, body: "Reply" });
    expect((await list()).items).toHaveLength(2);
    await alice.command("comment.delete", { id });
    await alice.command("comment.delete", { id });
    await alice.command("comment.create", { id, target, body: "Retry after delete" });
    expect((await list()).items).toHaveLength(1);
    const activity = (await alice.query("activity.list", {})).data;
    expect(JSON.stringify(activity)).toContain("comment.edited");
    expect(JSON.stringify(activity)).toContain("comment.deleted");
    expect(JSON.stringify(activity)).not.toContain("Updated");
  });
  it("rejects invalid bodies and missing targets, retains hidden comments through Task restoration", async () => {
    const { alice, target, taskId, list } = await setup();
    for (const body of [" ", "x".repeat(20001)]) expect((await alice.command("comment.create", { id: uuidv7(), target, body })).ok).toBe(false);
    expect((await alice.command("comment.create", { id: uuidv7(), target: { ...target, id: "missing" }, body: "No" })).ok).toBe(false);
    const id = uuidv7();
    await alice.command("comment.create", { id, target, body: "Keep me" });
    await alice.command("comment.create", { id, target, body: "Duplicate" });
    expect((await list()).items).toHaveLength(1);
    await alice.command("task.delete", { id: taskId });
    expect((await alice.command("comment.create", { id: uuidv7(), target, body: "Hidden" })).ok).toBe(false);
    const qid = uuidv7();
    alice.ws.send(JSON.stringify({ type: "query", id: qid, name: "comments.list", args: { target } }));
    expect((await alice.next("result_error", (m) => m.id === qid)).error.code).toBe("not_found");
    await alice.command("task.restore", { id: taskId });
    expect((await list()).items[0]?.body).toBe("Keep me");
  });
  it("paginates timestamp ties, scopes targets, and keeps snapshots free of Comments", async () => {
    const { wsId, alice, member, target, featureId, list } = await setup();
    const ids = ["c", "a", "b"];
    for (const id of ids) await alice.command("comment.create", { id, target, body: id });
    await alice.command("comment.create", { id: "feature-comment", target: { type: "feature", id: featureId }, body: "Separate" });
    await runInDurableObject(workspaceStub(wsId), (_instance, state) => {
      state.storage.sql.exec("UPDATE comments SET created_at = 100");
    });
    const a = await list({ limit: 1 });
    const b = await list({ limit: 1, cursor: a.nextCursor });
    const c = await list({ limit: 1, cursor: b.nextCursor });
    expect([...a.items, ...b.items, ...c.items].map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(c.nextCursor).toBeNull();
    const feature = (await alice.query("comments.list", { target: { type: "feature", id: featureId } })).data as CommentsPage;
    expect(feature.items.map((c) => c.id)).toEqual(["feature-comment"]);
    const reconnect = await connect(wsId, member);
    expect(reconnect.snapshot.data).not.toHaveProperty("comments");
    expect(((await reconnect.query("comments.list", { target })).data as CommentsPage).items).toHaveLength(3);
    const other = await connect(freshWorkspaceId(), newMember());
    expect((await other.command("comment.create", { id: uuidv7(), target, body: "Wrong Workspace" })).ok).toBe(false);
  });
});
