import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Meeting, Task, Topic } from "../src/shared/entities";
import { uuidv7 } from "../src/shared/ids";
import { connect, freshWorkspaceId, newMember, workspaceStub } from "./helpers";

async function setup() {
  const wsId = freshWorkspaceId();
  const aliceMember = newMember("Alice");
  const bobMember = newMember("Bob");
  const alice = await connect(wsId, aliceMember);
  const bob = await connect(wsId, bobMember);
  const projectId = uuidv7();
  await alice.command("project.create", { id: projectId, key: "WEB", name: "Website" });
  return { wsId, alice, bob, aliceMember, bobMember, projectId };
}

async function topicRow(wsId: string, id: string) {
  const client = await connect(wsId, newMember("Reader"));
  return client.snapshot.data.topics.find((t: Topic) => t.id === id);
}

async function addTopic(client: Awaited<ReturnType<typeof connect>>, projectId: string, title: string) {
  const id = uuidv7();
  const result = await client.command("topic.create", { id, projectId, title });
  expect(result.ok).toBe(true);
  return id;
}

describe("topics", () => {
  it("creates Topics in order and lets anyone edit them", async () => {
    const { wsId, alice, bob, projectId } = await setup();
    const a = await addTopic(alice, projectId, "Pricing page");
    const b = await addTopic(alice, projectId, "Hiring");
    expect((await bob.command("topic.update", { id: a, body: "Do we need one?" })).ok).toBe(true);

    const reader = await connect(wsId, newMember("Reader"));
    const topics = reader.snapshot.data.topics;
    expect(topics.map((t: Topic) => t.id)).toEqual([a, b]);
    expect(topics[0]).toMatchObject({ projectId, body: "Do we need one?", outcome: null, resolvedAt: null });
  });

  it("only lets the author delete, and only while unresolved", async () => {
    const { alice, bob, projectId } = await setup();
    const id = await addTopic(alice, projectId, "Old idea");
    const byBob = await bob.command("topic.delete", { id });
    expect(byBob.ok).toBe(false);
    if (!byBob.ok) expect(byBob.m.error.code).toBe("forbidden");

    const meetingId = uuidv7();
    await alice.command("meeting.start", { id: meetingId, projectId });
    await alice.command("meeting.recordOutcome", { topicId: id, outcome: "Dropped" });
    expect((await alice.command("topic.delete", { id })).ok).toBe(false);

    await alice.command("meeting.clearOutcome", { topicId: id });
    const deleted = await alice.command("topic.delete", { id });
    expect(deleted.ok).toBe(true);
  });

  it("rejects a reference to a Task in another Project", async () => {
    const { alice, projectId } = await setup();
    const otherProject = uuidv7();
    const otherTask = uuidv7();
    await alice.command("project.create", { id: otherProject, key: "OPS", name: "Ops" });
    await alice.command("task.create", { id: otherTask, projectId: otherProject, title: "Elsewhere" });
    const result = await alice.command("topic.create", { id: uuidv7(), projectId, title: "x", ref: { type: "task", id: otherTask } });
    expect(result.ok).toBe(false);
  });
});

describe("meetings", () => {
  it("allows one open Meeting per Project, with every active Member attending by default", async () => {
    const { wsId, alice, bob, aliceMember, bobMember, projectId } = await setup();
    const id = uuidv7();
    expect((await alice.command("meeting.start", { id, projectId })).ok).toBe(true);
    const again = await bob.command("meeting.start", { id: uuidv7(), projectId });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.m.error.code).toBe("conflict");

    // Another Project can have its own Meeting at the same time.
    const ops = uuidv7();
    await alice.command("project.create", { id: ops, key: "OPS", name: "Ops" });
    expect((await alice.command("meeting.start", { id: uuidv7(), projectId: ops })).ok).toBe(true);

    const reader = await connect(wsId, newMember("Reader"));
    const meeting = reader.snapshot.data.meetings.find((m: Meeting) => m.id === id)!;
    expect(meeting.attendeeIds).toEqual([aliceMember.id, bobMember.id].sort());
    expect(meeting.endedAt).toBeNull();
  });

  it("records Outcomes only during a Meeting, and carries unresolved Topics over", async () => {
    const { wsId, alice, projectId } = await setup();
    const discussed = await addTopic(alice, projectId, "Discussed");
    const skipped = await addTopic(alice, projectId, "Skipped");

    const early = await alice.command("meeting.recordOutcome", { topicId: discussed, outcome: "Too early" });
    expect(early.ok).toBe(false);

    const first = uuidv7();
    await alice.command("meeting.start", { id: first, projectId });
    await alice.command("meeting.recordOutcome", { topicId: discussed, outcome: "Agreed" });
    await alice.command("meeting.close", { id: first });

    expect(await topicRow(wsId, discussed)).toMatchObject({ outcome: "Agreed", resolvedInMeetingId: first });
    expect(await topicRow(wsId, skipped)).toMatchObject({ outcome: null, resolvedInMeetingId: null });

    // The next Meeting can resolve the carried-over Topic but not change the closed Meeting's record.
    await alice.command("meeting.start", { id: uuidv7(), projectId });
    expect((await alice.command("meeting.recordOutcome", { topicId: skipped, outcome: "Done now" })).ok).toBe(true);
    const rewrite = await alice.command("meeting.recordOutcome", { topicId: discussed, outcome: "Changed my mind" });
    expect(rewrite.ok).toBe(false);
    if (!rewrite.ok) expect(rewrite.m.error.code).toBe("conflict");
  });

  it("creates an assigned Task from a Topic and notes its key in the Outcome", async () => {
    const { wsId, alice, bob, bobMember, projectId } = await setup();
    const topicId = await addTopic(alice, projectId, "Landing page");
    await alice.command("meeting.start", { id: uuidv7(), projectId });

    const taskId = uuidv7();
    const { id: cmdId } = await alice.command("meeting.createTask", { topicId, taskId, title: "Write landing copy", assigneeId: bobMember.id });
    const change = await bob.next("change", (m) => m.cause === cmdId);
    expect(change.changes.map((c) => c.entity).sort()).toEqual(["activity", "activity", "project", "task", "topic"]);

    await alice.command("meeting.createTask", { topicId, taskId: uuidv7(), title: "Design hero image" });
    const topic = await topicRow(wsId, topicId);
    expect(topic?.outcome).toBe("Created WEB-1 for Bob\nCreated WEB-2");

    const reader = await connect(wsId, newMember("Reader"));
    expect(reader.snapshot.data.tasks.find((t: Task) => t.id === taskId)).toMatchObject({ number: 1, assigneeId: bobMember.id, status: "todo" });

    // Retrying the same command does not create a second Task.
    const retry = await alice.command("meeting.createTask", { topicId, taskId, title: "Write landing copy" });
    expect(retry.ok).toBe(true);
    expect((await topicRow(wsId, topicId))?.outcome).toBe("Created WEB-1 for Bob\nCreated WEB-2");
  });

  it("updates attendees and refuses changes once closed", async () => {
    const { wsId, alice, aliceMember, projectId } = await setup();
    const id = uuidv7();
    await alice.command("meeting.start", { id, projectId });
    await alice.command("meeting.setAttendees", { id, memberIds: [aliceMember.id] });
    await alice.command("meeting.close", { id });
    expect((await alice.command("meeting.setAttendees", { id, memberIds: [] })).ok).toBe(false);

    const kinds = await runInDurableObject(workspaceStub(wsId), (_, state) =>
      state.storage.sql.exec<{ kind: string }>("SELECT kind FROM activity WHERE target_id = ? ORDER BY at, id", id).toArray().map((r) => r.kind),
    );
    expect(kinds).toEqual(["meeting.started", "meeting.attendees", "meeting.closed"]);
    const reader = await connect(wsId, newMember("Reader"));
    expect(reader.snapshot.data.meetings.find((m: Meeting) => m.id === id)?.attendeeIds).toEqual([aliceMember.id]);
  });
});
