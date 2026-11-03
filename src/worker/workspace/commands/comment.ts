import type { CommandArgs } from "../../../shared/commands";
import type { CommentTarget } from "../../../shared/entities";
import { CommandContext, CommandError } from "../context";
import { one, toComment } from "../rows";

export function requireCommentTarget(sql: SqlStorage, target: CommentTarget) {
  const query = target.type === "task"
    ? "SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL"
    : "SELECT id FROM features WHERE id = ?";
  if (!sql.exec(query, target.id).toArray().length) throw new CommandError("not_found", "Comment target not found");
}
function get(ctx: CommandContext, id: string) {
  return one(ctx.sql, toComment, "SELECT * FROM comments WHERE id = ?", id);
}
export function create(ctx: CommandContext, args: CommandArgs<"comment.create">) {
  const existing = get(ctx, args.id);
  if (existing) {
    if (existing.authorId !== ctx.actorId || existing.targetType !== args.target.type || existing.targetId !== args.target.id)
      throw new CommandError("conflict", "Comment id is already in use");
    return;
  }
  // A retried create must not resurrect a Comment whose delete was already applied.
  if (ctx.sql.exec("SELECT id FROM activity WHERE kind = 'comment.deleted' AND json_extract(data, '$.commentId') = ? LIMIT 1", args.id).toArray().length) return;
  requireCommentTarget(ctx.sql, args.target);
  ctx.sql.exec("INSERT INTO comments (id, target_type, target_id, author_id, via, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args.id, args.target.type, args.target.id, ctx.actorId, ctx.via, args.body, ctx.now);
  ctx.activity("comment.created", args.target.type, args.target.id, { commentId: args.id });
  ctx.emit({ entity: "comment", op: "upsert", row: get(ctx, args.id)! });
}
export function edit(ctx: CommandContext, args: CommandArgs<"comment.edit">) {
  const row = get(ctx, args.id);
  if (!row) throw new CommandError("not_found", "Comment not found");
  if (row.authorId !== ctx.actorId) throw new CommandError("forbidden", "Only the author can edit a Comment");
  requireCommentTarget(ctx.sql, { type: row.targetType, id: row.targetId });
  if (row.body === args.body) return;
  ctx.sql.exec("UPDATE comments SET body = ?, edited_at = ? WHERE id = ?", args.body, ctx.now, row.id);
  ctx.activity("comment.edited", row.targetType, row.targetId, { commentId: row.id });
  ctx.emit({ entity: "comment", op: "upsert", row: get(ctx, row.id)! });
}
export function remove(ctx: CommandContext, args: CommandArgs<"comment.delete">) {
  const row = get(ctx, args.id);
  if (!row) return;
  if (row.authorId !== ctx.actorId) throw new CommandError("forbidden", "Only the author can delete a Comment");
  ctx.sql.exec("DELETE FROM comments WHERE id = ?", row.id);
  ctx.activity("comment.deleted", row.targetType, row.targetId, { commentId: row.id });
  ctx.emit({ entity: "comment", op: "delete", row: { id: row.id } });
}
