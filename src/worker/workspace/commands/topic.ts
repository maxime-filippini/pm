import { generateKeyBetween } from "fractional-indexing";
import type { CommandArgs } from "../../../shared/commands";
import { CommandContext, CommandError } from "../context";
import { one, toTask, toTopic } from "../rows";
import { getProject } from "./project";

export function getTopic(ctx: CommandContext, id: string) {
  const topic = one(ctx.sql, toTopic, "SELECT * FROM topics WHERE id = ?", id);
  if (!topic) throw new CommandError("not_found", "Topic not found");
  return topic;
}

export function emitTopic(ctx: CommandContext, id: string) {
  ctx.emit({ entity: "topic", op: "upsert", row: getTopic(ctx, id) });
}

/** A Topic may point at a Task, which must be in the Topic's Project. */
function checkRef(ctx: CommandContext, ref: { type: "task"; id: string } | null | undefined, projectId: string) {
  if (!ref) return;
  const task = one(ctx.sql, toTask, "SELECT * FROM tasks WHERE id = ?", ref.id);
  if (!task) throw new CommandError("not_found", "Referenced Task not found");
  if (task.projectId !== projectId) throw new CommandError("invalid", "Referenced Task belongs to another Project");
}

export function create(ctx: CommandContext, args: CommandArgs<"topic.create">) {
  if (one(ctx.sql, toTopic, "SELECT * FROM topics WHERE id = ?", args.id)) return; // idempotent retry
  const project = getProject(ctx, args.projectId);
  if (project.archivedAt !== null) throw new CommandError("invalid", "Project is archived");
  checkRef(ctx, args.ref, project.id);

  const last = ctx.sql
    .exec<{ rank: string }>("SELECT rank FROM topics WHERE project_id = ? ORDER BY rank DESC LIMIT 1", project.id)
    .toArray()[0];
  ctx.sql.exec(
    `INSERT INTO topics (id, project_id, title, body, ref_type, ref_id, rank, author_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args.id, project.id, args.title, args.body ?? "", args.ref?.type ?? null, args.ref?.id ?? null,
    generateKeyBetween(last?.rank ?? null, null), ctx.actorId, ctx.now,
  );
  ctx.activity("topic.created", "topic", args.id, { title: args.title });
  emitTopic(ctx, args.id);
}

export function update(ctx: CommandContext, args: CommandArgs<"topic.update">) {
  const topic = getTopic(ctx, args.id);
  let changed = false;
  if (args.title !== undefined && args.title !== topic.title) {
    ctx.sql.exec("UPDATE topics SET title = ? WHERE id = ?", args.title, topic.id);
    ctx.activity("topic.updated", "topic", topic.id, { field: "title", from: topic.title, to: args.title });
    changed = true;
  }
  if (args.body !== undefined && args.body !== topic.body) {
    ctx.sql.exec("UPDATE topics SET body = ? WHERE id = ?", args.body, topic.id);
    ctx.activity("topic.updated", "topic", topic.id, { field: "body" });
    changed = true;
  }
  if (args.ref !== undefined && (args.ref?.id ?? null) !== topic.refId) {
    checkRef(ctx, args.ref, topic.projectId);
    ctx.sql.exec("UPDATE topics SET ref_type = ?, ref_id = ? WHERE id = ?", args.ref?.type ?? null, args.ref?.id ?? null, topic.id);
    ctx.activity("topic.updated", "topic", topic.id, { field: "ref", from: topic.refId, to: args.ref?.id ?? null });
    changed = true;
  }
  if (changed) emitTopic(ctx, topic.id);
}

export function move(ctx: CommandContext, args: CommandArgs<"topic.move">) {
  const topic = getTopic(ctx, args.id);
  if (topic.rank === args.rank) return;
  ctx.sql.exec("UPDATE topics SET rank = ? WHERE id = ?", args.rank, topic.id); // no Activity, like task.move
  emitTopic(ctx, topic.id);
}

export function remove(ctx: CommandContext, args: CommandArgs<"topic.delete">) {
  const topic = one(ctx.sql, toTopic, "SELECT * FROM topics WHERE id = ?", args.id);
  if (!topic) return; // already gone: retried delete
  if (topic.authorId !== ctx.actorId) throw new CommandError("forbidden", "Only the author can delete a Topic");
  if (topic.resolvedAt !== null) throw new CommandError("invalid", "A resolved Topic can't be deleted");
  ctx.sql.exec("DELETE FROM topics WHERE id = ?", topic.id);
  ctx.activity("topic.deleted", "topic", topic.id, { title: topic.title });
  ctx.emit({ entity: "topic", op: "delete", row: { id: topic.id } });
}
