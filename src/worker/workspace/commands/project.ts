import type { CommandArgs } from "../../../shared/commands";
import { CommandContext, CommandError } from "../context";
import { one, toProject } from "../rows";

export function getProject(ctx: CommandContext, id: string) {
  const project = one(ctx.sql, toProject, "SELECT * FROM projects WHERE id = ?", id);
  if (!project) throw new CommandError("not_found", "Project not found");
  return project;
}

function emitProject(ctx: CommandContext, id: string) {
  ctx.emit({ entity: "project", op: "upsert", row: getProject(ctx, id) });
}

export function create(ctx: CommandContext, args: CommandArgs<"project.create">) {
  const existing = one(ctx.sql, toProject, "SELECT * FROM projects WHERE id = ?", args.id);
  if (existing) return; // retried create: idempotent no-op
  if (one(ctx.sql, toProject, "SELECT * FROM projects WHERE key = ?", args.key)) {
    throw new CommandError("conflict", `Project key ${args.key} is already used`);
  }
  ctx.sql.exec(
    "INSERT INTO projects (id, key, name, next_task_number, created_at, created_by) VALUES (?, ?, ?, 1, ?, ?)",
    args.id, args.key, args.name, ctx.now, ctx.actorId,
  );
  ctx.activity("project.created", "project", args.id, { key: args.key, name: args.name });
  emitProject(ctx, args.id);
}

export function rename(ctx: CommandContext, args: CommandArgs<"project.rename">) {
  const project = getProject(ctx, args.id);
  if (project.name === args.name) return;
  ctx.sql.exec("UPDATE projects SET name = ? WHERE id = ?", args.name, args.id);
  ctx.activity("project.renamed", "project", args.id, { field: "name", from: project.name, to: args.name });
  emitProject(ctx, args.id);
}

export function setArchived(ctx: CommandContext, args: { id: string }, archived: boolean) {
  const project = getProject(ctx, args.id);
  if ((project.archivedAt !== null) === archived) return;
  ctx.sql.exec("UPDATE projects SET archived_at = ? WHERE id = ?", archived ? ctx.now : null, args.id);
  ctx.activity(archived ? "project.archived" : "project.unarchived", "project", args.id);
  emitProject(ctx, args.id);
}
