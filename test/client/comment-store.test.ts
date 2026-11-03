import { beforeEach, describe, expect, it } from "vitest";
import type { Comment } from "../../src/shared/entities";
import { useWorkspace, workspaceActions as actions } from "../../src/client/store/workspace";
const target = { type: "task" as const, id: "task" };
const key = "task:task";
const row: Comment = { id: "c", targetType: "task", targetId: "task", authorId: "alice", via: null, body: "Original", createdAt: 1, editedAt: null };
const snapshot = { members: [], projects: [], features: [], tasks: [], topics: [], meetings: [], pullRequestLinks: [] };
const state = () => useWorkspace.getState();
function page(items: Comment[], version = 1, cursor: { createdAt: number; id: string } | null = null) {
  actions.commentsPage(target, { items, nextCursor: cursor }, version, state().connectionEpoch, state().commentCollections[key]!.generation);
}
beforeEach(() => { actions.reset(); actions.snapshot(1, "alice", snapshot); });
describe("loaded Comments", () => {
  it("ignores responses from a previous visit to the same target", () => {
    actions.loadComments(target);
    const generation = state().commentCollections[key]!.generation;
    actions.unloadComments(target);
    actions.loadComments(target);
    actions.commentsPage(target, { items: [row], nextCursor: null }, 1, state().connectionEpoch, generation);
    expect(state().comments[key]).toEqual([]);
  });

  it("ignores unloaded targets and releases collection state when leaving", () => {
    actions.change(2, [{ entity: "comment", op: "upsert", row }]);
    expect(state().comments).toEqual({});
    actions.loadComments(target);
    page([row]);
    actions.unloadComments(target);
    expect(state().commentCollections).toEqual({});
    expect(state().comments).toEqual({});
  });
  it("preserves live edits/deletes racing a query and deduplicates page boundaries", () => {
    actions.loadComments(target);
    actions.change(2, [{ entity: "comment", op: "upsert", row: { ...row, body: "New" } }]);
    page([row], 1, { createdAt: 1, id: row.id });
    expect(state().comments[key]?.[0]?.body).toBe("New");
    actions.change(3, [{ entity: "comment", op: "delete", row: { id: row.id } }]);
    page([row], 1);
    expect(state().comments[key]).toEqual([]);
    page([{ ...row, id: "d" }], 3);
    page([{ ...row, id: "d" }], 3);
    expect(state().comments[key]).toHaveLength(1);
  });
  it("rolls back rejected optimistic create/edit/delete and reprojects pending commands after reconnect", () => {
    actions.loadComments(target);
    page([row]);
    actions.addPending({ id: "edit", at: 2, command: { name: "comment.edit", args: { id: row.id, body: "Draft" } } });
    expect(state().comments[key]?.[0]?.body).toBe("Draft");
    actions.removePending("edit");
    expect(state().comments[key]?.[0]?.body).toBe("Original");
    actions.addPending({ id: "delete", at: 2, command: { name: "comment.delete", args: { id: row.id } } });
    expect(state().comments[key]).toEqual([]);
    actions.removePending("delete");
    expect(state().comments[key]).toHaveLength(1);
    actions.addPending({ id: "create", at: 2, command: { name: "comment.create", args: { id: "new", target, body: "Pending" } } });
    expect(state().comments[key]).toHaveLength(2);
    const oldGeneration = state().commentCollections[key]!.generation;
    const oldEpoch = state().connectionEpoch;
    actions.snapshot(5, "alice", snapshot);
    actions.commentsPage(target, { items: [row], nextCursor: null }, 1, oldEpoch, oldGeneration);
    expect(state().comments[key]?.map((c) => c.id)).toEqual(["new"]);
    page([row], 5);
    expect(state().comments[key]).toHaveLength(2);
    actions.removePending("create");
    expect(state().comments[key]).toHaveLength(1);
  });
});
