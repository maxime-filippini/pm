import { evictDurableObject, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/ids";
import { connect, freshWorkspaceId, newMember, workspaceStub } from "./helpers";

describe("sync protocol", () => {
  it("sends a snapshot with the connecting Member on connect", async () => {
    const wsId = freshWorkspaceId();
    const alice = newMember("Alice");
    const client = await connect(wsId, alice);
    expect(client.snapshot.memberId).toBe(alice.id);
    expect(client.snapshot.data.members).toEqual([{ ...alice, active: true }]);
  });

  it("broadcasts one client's command to another client as a change", async () => {
    const wsId = freshWorkspaceId();
    const alice = await connect(wsId, newMember("Alice"));
    const bob = await connect(wsId, newMember("Bob"));
    const id = uuidv7();
    const { id: commandId } = await alice.command("project.create", { id, key: "OPS", name: "Ops" });
    const change = await bob.next("change", (m) => m.cause === commandId);
    expect(change.changes.map((c) => c.entity).sort()).toEqual(["activity", "project"]);
    expect(change.version).toBeGreaterThan(bob.snapshot.version);
  });

  it("rejects an invalid command with a reason and changes nothing", async () => {
    const wsId = freshWorkspaceId();
    const alice = await connect(wsId, newMember());
    const before = alice.snapshot.version;
    const result = await alice.command("task.setStatus", { id: uuidv7(), status: "done" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.m.error.code).toBe("not_found");
    const again = await connect(wsId, newMember());
    expect(again.snapshot.version).toBe(before + 1); // only the second Member joining bumped it
  });

  it("treats a retried create with the same id as a no-op", async () => {
    const wsId = freshWorkspaceId();
    const alice = await connect(wsId, newMember());
    const projectId = uuidv7();
    const taskId = uuidv7();
    await alice.command("project.create", { id: projectId, key: "APP", name: "App" });
    const first = await alice.command("task.create", { id: taskId, projectId, title: "Once" });
    const retry = await alice.command("task.create", { id: taskId, projectId, title: "Once" });
    expect([first.ok, retry.ok]).toEqual([true, true]);
    const viewer = await connect(wsId, newMember());
    expect(viewer.snapshot.data.tasks).toHaveLength(1);
    expect(viewer.snapshot.data.projects[0]?.nextTaskNumber).toBe(2);
  });

  it("answers activity.list queries newest first", async () => {
    const wsId = freshWorkspaceId();
    const alice = await connect(wsId, newMember());
    await alice.command("project.create", { id: uuidv7(), key: "AA", name: "A" });
    await alice.command("project.create", { id: uuidv7(), key: "BB", name: "B" });
    const result = await alice.query("activity.list", { limit: 10 });
    const items = (result.data as { items: Array<{ data: { key: string } }> }).items;
    expect(items.map((i) => i.data.key)).toEqual(["BB", "AA"]);
  });

  it("closes a removed Member's sockets and marks them inactive", async () => {
    const wsId = freshWorkspaceId();
    const alice = newMember("Alice");
    const bob = newMember("Bob");
    const aliceClient = await connect(wsId, alice);
    const bobClient = await connect(wsId, bob);
    const closed = new Promise<number>((resolve) => bobClient.ws.addEventListener("close", (e) => resolve(e.code)));
    await workspaceStub(wsId).deactivateMember(bob.id);
    expect(await closed).toBe(4003);
    const change = await aliceClient.next("change", (m) => m.changes.some((c) => c.entity === "member" && c.row.id === bob.id && "active" in c.row && !c.row.active));
    expect(change.changes[0]?.row).toMatchObject({ id: bob.id, active: false });
    const result = await bobClient.command("project.create", { id: uuidv7(), key: "NO", name: "No" }).catch(() => null);
    expect(result).toBeNull();
  });
});

describe("hibernation", () => {
  it("accepts sockets through the Hibernation API", async () => {
    const wsId = freshWorkspaceId();
    await connect(wsId, newMember());
    await connect(wsId, newMember());
    const count = await runInDurableObject(workspaceStub(wsId), (_, state) => state.getWebSockets().length);
    expect(count).toBe(2);
  });

  it("keeps serving commands after waking from only storage and socket attachments", async () => {
    const wsId = freshWorkspaceId();
    const alice = await connect(wsId, newMember("Alice"));
    const bob = await connect(wsId, newMember("Bob"));
    const projectId = uuidv7();
    await alice.command("project.create", { id: projectId, key: "HIB", name: "Hibernate" });

    await evictDurableObject(workspaceStub(wsId)); // instance torn down; sockets hibernated

    const { id } = await alice.command("task.create", { id: uuidv7(), projectId, title: "After wake" });
    const change = await bob.next("change", (m) => m.cause === id);
    const task = change.changes.find((c) => c.entity === "task");
    expect(task?.row).toMatchObject({ title: "After wake", number: 1, createdBy: alice.snapshot.memberId });
  });
});
