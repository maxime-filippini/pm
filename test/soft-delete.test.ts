import { describe, expect, it } from "vitest";
import type { Meeting, Task, Topic } from "../src/shared/entities";
import { uuidv7 } from "../src/shared/ids";
import { connect, freshWorkspaceId, newMember } from "./helpers";

async function setup() {
  const wsId = freshWorkspaceId();
  const alice = await connect(wsId, newMember("Alice"));
  const projectId = uuidv7();
  await alice.command("project.create", { id: projectId, key: "WEB", name: "Website" });
  return { wsId, alice, projectId };
}

const fresh = async (wsId: string) => (await connect(wsId, newMember("Reader"))).snapshot.data;

describe("task soft delete", () => {
  it("hides a deleted Task, keeps its number, and restores it", async () => {
    const { wsId, alice, projectId } = await setup();
    const id = uuidv7();
    await alice.command("task.create", { id, projectId, title: "Oops" });

    const { id: cmd } = await alice.command("task.delete", { id });
    const change = await alice.next("change", (m) => m.cause === cmd);
    expect(change.changes).toContainEqual({ entity: "task", op: "delete", row: { id } });
    expect((await fresh(wsId)).tasks.find((t: Task) => t.id === id)).toBeUndefined();

    // Edits to a deleted Task are rejected; numbers are not reused.
    expect((await alice.command("task.update", { id, title: "Still here?" })).ok).toBe(false);
    const next = uuidv7();
    await alice.command("task.create", { id: next, projectId, title: "Next" });
    expect((await fresh(wsId)).tasks.find((t: Task) => t.id === next)?.number).toBe(2);

    await alice.command("task.restore", { id });
    expect((await fresh(wsId)).tasks.find((t: Task) => t.id === id)).toMatchObject({ title: "Oops", number: 1 });
  });

  it("can't be referenced by a new Topic once deleted", async () => {
    const { alice, projectId } = await setup();
    const id = uuidv7();
    await alice.command("task.create", { id, projectId, title: "Gone" });
    await alice.command("task.delete", { id });
    const result = await alice.command("topic.create", { id: uuidv7(), projectId, title: "About it", ref: { type: "task", id } });
    expect(result.ok).toBe(false);
  });
});

describe("meeting soft delete", () => {
  it("closes an open Meeting when deleted, so a new one can start", async () => {
    const { wsId, alice, projectId } = await setup();
    const id = uuidv7();
    await alice.command("meeting.start", { id, projectId });
    expect((await alice.command("meeting.delete", { id })).ok).toBe(true);
    expect((await fresh(wsId)).meetings.find((m: Meeting) => m.id === id)).toBeUndefined();
    expect((await alice.command("meeting.start", { id: uuidv7(), projectId })).ok).toBe(true);
  });

  it("puts resolved Topics back on the agenda, and restore puts their Outcomes back", async () => {
    const { wsId, alice, projectId } = await setup();
    const topicA = uuidv7();
    const topicB = uuidv7();
    await alice.command("topic.create", { id: topicA, projectId, title: "A" });
    await alice.command("topic.create", { id: topicB, projectId, title: "B" });
    const meeting = uuidv7();
    await alice.command("meeting.start", { id: meeting, projectId });
    await alice.command("meeting.recordOutcome", { topicId: topicA, outcome: "Agreed A" });
    await alice.command("meeting.recordOutcome", { topicId: topicB, outcome: "Agreed B" });
    await alice.command("meeting.close", { id: meeting });

    await alice.command("meeting.delete", { id: meeting });
    let data = await fresh(wsId);
    expect(data.topics.filter((t: Topic) => t.resolvedAt === null).map((t: Topic) => t.id).sort()).toEqual([topicA, topicB].sort());

    // B gets resolved again in a new Meeting before the old one is restored: B keeps its new Outcome.
    const second = uuidv7();
    await alice.command("meeting.start", { id: second, projectId });
    await alice.command("meeting.recordOutcome", { topicId: topicB, outcome: "Decided again" });
    await alice.command("meeting.close", { id: second });

    await alice.command("meeting.restore", { id: meeting });
    data = await fresh(wsId);
    expect(data.meetings.find((m: Meeting) => m.id === meeting)?.endedAt).not.toBeNull();
    expect(data.topics.find((t: Topic) => t.id === topicA)).toMatchObject({ outcome: "Agreed A", resolvedInMeetingId: meeting });
    expect(data.topics.find((t: Topic) => t.id === topicB)).toMatchObject({ outcome: "Decided again", resolvedInMeetingId: second });
  });

  it("rejects changes to a deleted Meeting", async () => {
    const { alice, projectId } = await setup();
    const id = uuidv7();
    await alice.command("meeting.start", { id, projectId });
    await alice.command("meeting.delete", { id });
    expect((await alice.command("meeting.setAttendees", { id, memberIds: [] })).ok).toBe(false);
    expect((await alice.command("meeting.close", { id })).ok).toBe(false);
  });
});
