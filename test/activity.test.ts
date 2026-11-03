import { describe, expect, it } from "vitest";
import { runInDurableObject } from "cloudflare:test";
import { uuidv7 } from "../src/shared/ids";
import type { ActivityPage } from "../src/shared/protocol";
import { connect, freshWorkspaceId, newMember, workspaceStub } from "./helpers";

describe("Activity queries and durable Restore", () => {
  it("filters targets and paginates ties without dropping or duplicating rows", async () => {
    const workspace = freshWorkspaceId(), client = await connect(workspace, newMember());
    const projectId = uuidv7(), id = uuidv7();
    await client.command("project.create", { id: projectId, key: "WEB", name: "Web" });
    await client.command("task.create", { id, projectId, title: "Task" });
    await client.command("task.update", { id, title: "Updated", description: "Body" });
    await runInDurableObject(workspaceStub(workspace), (_instance, state) => { state.storage.sql.exec("UPDATE activity SET at = 100"); });
    const items: string[] = [];
    let cursor: ActivityPage["nextCursor"] = null;
    do {
      const page = (await client.query("activity.list", { limit: 1, ...(cursor && { cursor }) })).data as ActivityPage;
      items.push(...page.items.map((i) => i.id)); cursor = page.nextCursor;
    } while (cursor);
    expect(items).toHaveLength(4);
    expect(new Set(items).size).toBe(4);
    expect(items).toEqual([...items].sort().reverse());
    const filtered = (await client.query("activity.list", { target: { type: "task", id } })).data as ActivityPage;
    expect(filtered.items).toHaveLength(3);
    expect(filtered.items.every((i) => i.targetType === "task" && i.targetId === id)).toBe(true);
    const q = uuidv7();
    client.ws.send(JSON.stringify({ type: "query", id: q, name: "activity.list", args: { before: 5, cursor: { at: 5, id: "a" } } }));
    expect((await client.next("result_error", (m) => m.id === q)).error.code).toBe("invalid");
  });
  it("derives eligibility across repeated deletion cycles, reconnects, and restores closed Meetings", async () => {
    const workspace = freshWorkspaceId(), member = newMember();
    const client = await connect(workspace, member);
    const projectId = uuidv7(), id = uuidv7(), meetingId = uuidv7();
    await client.command("project.create", { id: projectId, key: "WEB", name: "Web" });
    await client.command("task.create", { id, projectId, title: "Task" });
    await client.command("task.delete", { id });
    await client.command("task.restore", { id });
    await client.command("task.delete", { id });
    await client.command("meeting.start", { id: meetingId, projectId });
    await client.command("meeting.delete", { id: meetingId });
    const reconnect = await connect(workspace, member);
    const page = (await reconnect.query("activity.list", {})).data as ActivityPage;
    const deletions = page.items.filter((i) => i.kind === "task.deleted");
    expect(deletions.map((i) => i.canRestore)).toEqual([true, false]);
    expect(page.items.find((i) => i.kind === "meeting.deleted")?.canRestore).toBe(true);
    await reconnect.command("task.restore", { id });
    await reconnect.command("task.restore", { id });
    await reconnect.command("meeting.restore", { id: meetingId });
    const updated = (await reconnect.query("activity.list", {})).data as ActivityPage;
    expect(updated.items.filter((i) => i.kind.endsWith(".deleted")).every((i) => !i.canRestore)).toBe(true);
    const read = await connect(workspace, member);
    expect(read.snapshot.data.tasks.some((t) => t.id === id)).toBe(true);
    expect(read.snapshot.data.meetings[0]?.endedAt).not.toBeNull();
  });
});
