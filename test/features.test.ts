import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/ids";
import { connect, freshWorkspaceId, newMember } from "./helpers";

async function setup() {
  const wsId = freshWorkspaceId();
  const member = newMember();
  const alice = await connect(wsId, member);
  const bob = await connect(wsId, newMember("Bob"));
  const projectId = uuidv7();
  await alice.command("project.create", { id: projectId, key: "WEB", name: "Web" });
  const id = uuidv7();
  expect((await alice.command("feature.create", { id, projectId, title: "Landing page" })).ok).toBe(true);
  const read = async () => (await connect(wsId, member)).snapshot.data;
  return { alice, bob, member, projectId, id, read };
}

describe("Features", () => {
  it("syncs proposals, records decisions and only completes when a Member asks", async () => {
    const { alice, bob, member, projectId, id, read } = await setup();
    expect((await read()).features[0]).toMatchObject({ id, status: "proposed", decidedAt: null, decidedBy: null });
    const result = await bob.command("feature.update", { id, title: "Public site", description: "Explain the product" });
    const change = await alice.next("change", (m) => m.cause === result.id);
    expect(change.changes.some((c) => c.entity === "feature" && c.op === "upsert" && c.row.title === "Public site")).toBe(true);
    await alice.command("feature.setStatus", { id, status: "accepted" });
    const accepted = (await read()).features[0]!;
    expect(accepted).toMatchObject({ status: "accepted", decidedBy: member.id, decidedAt: expect.any(Number) });
    const taskId = uuidv7();
    await alice.command("task.create", { id: taskId, projectId, featureId: id, title: "Copy" });
    await alice.command("task.setStatus", { id: taskId, status: "done" });
    expect((await read()).features[0]?.status).toBe("accepted");
    await alice.command("feature.setStatus", { id, status: "done" });
    expect((await read()).features[0]).toMatchObject({ status: "done", decidedBy: member.id, decidedAt: accepted.decidedAt });
    await bob.command("feature.setStatus", { id, status: "rejected" });
    expect((await read()).features[0]?.decidedBy).not.toBe(member.id);
    const activity = await alice.query("activity.list", { limit: 100 });
    expect(JSON.stringify(activity.data)).toContain("feature.status");
  });

  it("keeps creates idempotent and rejects invalid or archived proposals", async () => {
    const { alice, projectId, id, read } = await setup();
    await alice.command("feature.create", { id, projectId, title: "Retry" });
    expect((await read()).features).toHaveLength(1);
    expect((await read()).features[0]?.title).toBe("Landing page");
    expect((await alice.command("feature.create", { id: uuidv7(), projectId, title: " " })).ok).toBe(false);
    expect((await alice.command("feature.update", { id: "missing", title: "Oops" })).ok).toBe(false);
    expect((await alice.command("feature.setStatus", { id, status: "unknown" })).ok).toBe(false);
    await alice.command("project.archive", { id: projectId });
    expect((await alice.command("feature.create", { id: uuidv7(), projectId, title: "Archived" })).ok).toBe(false);
  });

  it("permits same-Project linkage for any Feature status and rejects cross-Project links", async () => {
    const { alice, projectId, id, read } = await setup();
    const other = uuidv7();
    await alice.command("project.create", { id: other, key: "OPS", name: "Ops" });
    expect((await alice.command("task.create", { id: uuidv7(), projectId: other, featureId: id, title: "Wrong" })).ok).toBe(false);
    const taskId = uuidv7();
    await alice.command("task.create", { id: taskId, projectId: other, title: "Other" });
    expect((await alice.command("task.update", { id: taskId, featureId: id })).ok).toBe(false);
    for (const status of ["proposed", "accepted", "rejected", "done"]) {
      await alice.command("feature.setStatus", { id, status });
      expect((await alice.command("task.create", { id: uuidv7(), projectId, featureId: id, title: status })).ok).toBe(true);
    }
    const linked = (await read()).tasks.find((t) => t.featureId === id)!;
    await alice.command("task.update", { id: linked.id, featureId: null });
    expect((await read()).tasks.find((t) => t.id === linked.id)?.featureId).toBeNull();
  });

  it("creates a proposal and Outcome together during a Meeting, safely retried after closure", async () => {
    const { alice, projectId, read } = await setup();
    const topicId = uuidv7(), featureId = uuidv7(), meetingId = uuidv7();
    await alice.command("topic.create", { id: topicId, projectId, title: "Idea", body: "Context" });
    const args = { topicId, featureId, title: "New proposal" };
    expect((await alice.command("meeting.createFeature", args)).ok).toBe(false);
    expect((await read()).features.some((f) => f.id === featureId)).toBe(false);
    await alice.command("meeting.start", { id: meetingId, projectId });
    expect((await alice.command("meeting.createFeature", args)).ok).toBe(true);
    await alice.command("meeting.close", { id: meetingId });
    expect((await alice.command("meeting.createFeature", args)).ok).toBe(true);
    expect((await alice.command("meeting.createFeature", { ...args, featureId: uuidv7() })).ok).toBe(false);
    const snapshot = await read();
    expect(snapshot.features.filter((f) => f.id === featureId)).toEqual([expect.objectContaining({ projectId, status: "proposed", description: "Context" })]);
    expect(snapshot.topics.find((t) => t.id === topicId)).toMatchObject({ outcome: "Proposed Feature: New proposal", resolvedInMeetingId: meetingId });
  });
});
