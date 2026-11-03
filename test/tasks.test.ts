import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/ids";
import { connect, freshWorkspaceId, newMember, workspaceStub } from "./helpers";

async function setup() {
  const wsId = freshWorkspaceId();
  const alice = newMember("Alice");
  const client = await connect(wsId, alice);
  const projectId = uuidv7();
  await client.command("project.create", { id: projectId, key: "WEB", name: "Website" });
  return { wsId, alice, client, projectId };
}

async function activityKinds(wsId: string, targetId: string) {
  return runInDurableObject(workspaceStub(wsId), (_, state) =>
    state.storage.sql.exec<{ kind: string }>("SELECT kind FROM activity WHERE target_id = ? ORDER BY at, id", targetId).toArray().map((r) => r.kind),
  );
}

describe("projects", () => {
  it("creates a Project and records Activity", async () => {
    const { client, projectId, wsId } = await setup();
    const change = await client.next("change", (m) => m.changes.some((c) => c.entity === "project"));
    expect(change.changes.find((c) => c.entity === "project")?.row).toMatchObject({ id: projectId, key: "WEB", nextTaskNumber: 1, hasGithubToken: false });
    expect(await activityKinds(wsId, projectId)).toEqual(["project.created"]);
  });

  it("rejects a duplicate or malformed key", async () => {
    const { client } = await setup();
    expect((await client.command("project.create", { id: uuidv7(), key: "WEB", name: "Again" })).ok).toBe(false);
    const bad = await client.command("project.create", { id: uuidv7(), key: "web", name: "Lower" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.m.error.code).toBe("invalid");
  });

  it("renames, archives and unarchives", async () => {
    const { client, projectId, wsId } = await setup();
    await client.command("project.rename", { id: projectId, name: "Site" });
    await client.command("project.archive", { id: projectId });
    await client.command("project.unarchive", { id: projectId });
    expect(await activityKinds(wsId, projectId)).toEqual(["project.created", "project.renamed", "project.archived", "project.unarchived"]);
  });
});

describe("tasks", () => {
  it("assigns numbers, sets completed_at on done and clears it after", async () => {
    const { wsId, client, projectId } = await setup();
    const a = uuidv7();
    const b = uuidv7();
    await client.command("task.create", { id: a, projectId, title: "First" });
    await client.command("task.create", { id: b, projectId, title: "Second" });
    await client.command("task.setStatus", { id: a, status: "done" });

    const viewer = await connect(wsId, newMember("Bob"));
    const tasks = viewer.snapshot.data.tasks;
    const first = tasks.find((t) => t.id === a)!;
    const second = tasks.find((t) => t.id === b)!;
    expect([first.number, second.number]).toEqual([1, 2]);
    expect(first.rank < second.rank).toBe(true);
    expect(first.completedAt).not.toBeNull();

    await client.command("task.setStatus", { id: a, status: "in_progress" });
    const reopened = await connect(wsId, newMember("Carol"));
    expect(reopened.snapshot.data.tasks.find((t) => t.id === a)?.completedAt).toBeNull();
    expect(await activityKinds(wsId, a)).toEqual(["task.created", "task.status", "task.status"]);
  });

  it("only assigns active Members", async () => {
    const { client, projectId, alice } = await setup();
    const ok = await client.command("task.create", { id: uuidv7(), projectId, title: "Mine", assigneeId: alice.id });
    expect(ok.ok).toBe(true);
    const bad = await client.command("task.create", { id: uuidv7(), projectId, title: "Ghost", assigneeId: uuidv7() });
    expect(bad.ok).toBe(false);
  });

  it("refuses Tasks in an archived Project", async () => {
    const { client, projectId } = await setup();
    await client.command("project.archive", { id: projectId });
    expect((await client.command("task.create", { id: uuidv7(), projectId, title: "Nope" })).ok).toBe(false);
  });

  it("records one Activity entry per changed field and none for moves", async () => {
    const { wsId, client, projectId, alice } = await setup();
    const id = uuidv7();
    await client.command("task.create", { id, projectId, title: "T" });
    await client.command("task.update", { id, title: "T2", assigneeId: alice.id });
    await client.command("task.update", { id, title: "T2" }); // no-op
    await client.command("task.move", { id, rank: "a5" });
    expect(await activityKinds(wsId, id)).toEqual(["task.created", "task.updated", "task.updated"]);
  });
});
