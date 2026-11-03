import type { Change, Comment, CommentTarget } from "../../shared/entities";
import type { CommentsPage } from "../../shared/protocol";
import type { Pending } from "./workspace";

export type CommentCollection = {
  target: CommentTarget;
  generation: symbol;
  rows: Record<string, Comment>;
  /** Includes tombstones so an in-flight page cannot resurrect a live deletion. */
  revisions: Record<string, number>;
  nextCursor: CommentsPage["nextCursor"];
  loaded: boolean;
};
export const commentKey = (target: CommentTarget) => `${target.type}:${target.id}`;
export const newCollection = (target: CommentTarget): CommentCollection => ({
  target, generation: Symbol(), rows: {}, revisions: {}, nextCursor: null, loaded: false,
});
export function commentChange(collection: CommentCollection, change: Extract<Change, { entity: "comment" }>, version: number): CommentCollection {
  if (change.op === "upsert" && (change.row.targetType !== collection.target.type || change.row.targetId !== collection.target.id)) return collection;
  // Deletes contain only an id. Remember them even if the first query hasn't returned.
  const rows = { ...collection.rows };
  if (change.op === "delete") delete rows[change.row.id];
  else rows[change.row.id] = change.row;
  return { ...collection, rows, revisions: { ...collection.revisions, [change.row.id]: version } };
}
export function commentPage(collection: CommentCollection, page: CommentsPage, requestedVersion: number): CommentCollection {
  const rows = { ...collection.rows };
  for (const row of page.items) {
    if ((collection.revisions[row.id] ?? -1) <= requestedVersion) rows[row.id] = row;
  }
  return { ...collection, rows, loaded: true, nextCursor: page.nextCursor };
}
export function projectComments(collection: CommentCollection, pending: Pending[], memberId: string): Comment[] {
  const rows = { ...collection.rows };
  for (const p of pending) {
    const c = p.command;
    if (c.name === "comment.create") {
      const { id, target, body } = c.args;
      if (commentKey(target) === commentKey(collection.target) && !rows[id]) rows[id] = {
        id, targetType: target.type, targetId: target.id, body, authorId: memberId, via: null, createdAt: p.at, editedAt: null,
      };
    } else if (c.name === "comment.edit" && rows[c.args.id]?.authorId === memberId) {
      rows[c.args.id] = { ...rows[c.args.id]!, body: c.args.body, editedAt: p.at };
    } else if (c.name === "comment.delete" && rows[c.args.id]?.authorId === memberId) delete rows[c.args.id];
  }
  return Object.values(rows).sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
