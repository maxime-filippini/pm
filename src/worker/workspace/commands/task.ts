import { generateKeyBetween } from "fractional-indexing";
import type { CommandArgs } from "../../../shared/commands";
import type { Task } from "../../../shared/entities";
import { CommandContext, CommandError } from "../context";
import { one, toFeature, toMember, toTask } from "../rows";
import { getProject } from "./project";

/** A live (not deleted) Task. */
function getTask(ctx: CommandContext, id: string) {
  const task = one(ctx.sql, toTask, "SELECT * FROM tasks WHERE id = ? AND deleted_at IS NULL", id);
  if (!task) throw new CommandError("not_found", "Task not found");
  return task;
}

function emitTask(ctx: CommandContext, id: string) {
  ctx.emit({ entity: "task", op: "upsert", row: getTask(ctx, id) });
}

function checkAssignee(ctx: CommandContext, assigneeId: string | null | undefined) {
  if (!assigneeId) return;
  const member = one(ctx.sql, toMember, "SELECT * FROM members WHERE id = ?", assigneeId);
  if (!member?.active) throw new CommandError("invalid", "Assignee is not an active Member");
}

function checkFeature(ctx: CommandContext, featureId: string | null | undefined, projectId: string) {
  if (!featureId) return;
  const feature = one(ctx.sql, toFeature, "SELECT * FROM features WHERE id = ?", featureId);
  if (!feature) throw new CommandError("not_found", "Feature not found");
  if (feature.projectId !== projectId) throw new CommandError("invalid", "Feature belongs to another Project");
}

export function create(ctx: CommandContext, args: CommandArgs<"task.create">) {
  if (one(ctx.sql, toTask, "SELECT * FROM tasks WHERE id = ?", args.id)) return; // idempotent retry
  const project = getProject(ctx, args.projectId);
  if (project.archivedAt !== null) throw new CommandError("invalid", "Project is archived");
  checkAssignee(ctx, args.assigneeId);
  checkFeature(ctx, args.featureId, project.id);

  const status = args.status ?? "todo";
  let rank = args.rank;
  if (!rank) {
    const last = ctx.sql
      .exec<{ rank: string }>("SELECT rank FROM tasks WHERE project_id = ? ORDER BY rank DESC LIMIT 1", project.id)
      .toArray()[0];
    rank = generateKeyBetween(last?.rank ?? null, null);
  }

  ctx.sql.exec("UPDATE projects SET next_task_number = next_task_number + 1 WHERE id = ?", project.id);
  ctx.sql.exec(
    `INSERT INTO tasks (id, project_id, number, feature_id, title, description, status, assignee_id, rank,
       created_by, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args.id, project.id, project.nextTaskNumber, args.featureId ?? null, args.title, args.description ?? "",
    status, args.assigneeId ?? null, rank, ctx.actorId, ctx.now, ctx.now, status === "done" ? ctx.now : null,
  );
  ctx.activity("task.created", "task", args.id, { key: `${project.key}-${project.nextTaskNumber}`, title: args.title });
  emitTask(ctx, args.id);
  ctx.emit({ entity: "project", op: "upsert", row: getProject(ctx, project.id) });
}

const updatable = [
  ["title", "title"],
  ["description", "description"],
  ["featureId", "feature_id"],
  ["assigneeId", "assignee_id"],
] as const satisfies ReadonlyArray<readonly [keyof Task, string]>;

export function update(ctx: CommandContext, args: CommandArgs<"task.update">) {
  const task = getTask(ctx, args.id);
  if (args.assigneeId !== undefined) checkAssignee(ctx, args.assigneeId);
  if (args.featureId !== undefined) checkFeature(ctx, args.featureId, task.projectId);

  let changed = false;
  for (const [field, column] of updatable) {
    const to = args[field];
    if (to === undefined || to === task[field]) continue;
    ctx.sql.exec(`UPDATE tasks SET ${column} = ? WHERE id = ?`, to, task.id);
    // Long text: record that it changed, not the full before/after.
    const data = field === "description" ? { field } : { field, from: task[field], to };
    ctx.activity("task.updated", "task", task.id, data);
    changed = true;
  }
  if (!changed) return;
  ctx.sql.exec("UPDATE tasks SET updated_at = ? WHERE id = ?", ctx.now, task.id);
  emitTask(ctx, task.id);
}

export function setStatus(ctx: CommandContext, args: CommandArgs<"task.setStatus">) {
  const task = getTask(ctx, args.id);
  if (task.status === args.status) return;
  const completedAt = args.status === "done" ? ctx.now : null;
  ctx.sql.exec(
    "UPDATE tasks SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?",
    args.status, completedAt, ctx.now, task.id,
  );
  ctx.activity("task.status", "task", task.id, { field: "status", from: task.status, to: args.status });
  emitTask(ctx, task.id);
}

export function move(ctx: CommandContext, args: CommandArgs<"task.move">) {
  const task = getTask(ctx, args.id);
  if (task.rank === args.rank) return;
  // Reordering is frequent and low-signal: no Activity entry.
  ctx.sql.exec("UPDATE tasks SET rank = ?, updated_at = ? WHERE id = ?", args.rank, ctx.now, task.id);
  emitTask(ctx, task.id);
}

export function remove(ctx: CommandContext, args: CommandArgs<"task.delete">) {
  const row = ctx.sql.exec<{ deleted_at: number | null }>("SELECT deleted_at FROM tasks WHERE id = ?", args.id).toArray()[0];
  if (!row) throw new CommandError("not_found", "Task not found");
  if (row.deleted_at !== null) return; // already deleted
  const task = getTask(ctx, args.id);
  ctx.sql.exec("UPDATE tasks SET deleted_at = ?, deleted_by = ? WHERE id = ?", ctx.now, ctx.actorId, task.id);
  ctx.activity("task.deleted", "task", task.id, { title: task.title, number: task.number, projectId: task.projectId });
  ctx.emit({ entity: "task", op: "delete", row: { id: task.id } });
}

export function restore(ctx: CommandContext, args: CommandArgs<"task.restore">) {
  const row = ctx.sql.exec<{ deleted_at: number | null }>("SELECT deleted_at FROM tasks WHERE id = ?", args.id).toArray()[0];
  if (!row) throw new CommandError("not_found", "Task not found");
  if (row.deleted_at === null) return; // not deleted
  ctx.sql.exec("UPDATE tasks SET deleted_at = NULL, deleted_by = NULL WHERE id = ?", args.id);
  ctx.activity("task.restored", "task", args.id);
  emitTask(ctx, args.id);
}
