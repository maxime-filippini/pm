import type { CommandArgs } from "../../../shared/commands";
import { CommandContext, CommandError } from "../context";
import { all, one, toPullRequestLink, toProject } from "../rows";

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


export function setGithubToken(ctx: CommandContext, args: CommandArgs<"project.setGithubToken">) {
  getProject(ctx, args.id);
  if (ctx.preparedToken === undefined) throw new CommandError("internal", "Token was not prepared");
  ctx.sql.exec("UPDATE projects SET github_token_enc = ? WHERE id = ?", ctx.preparedToken, args.id);
  ctx.sql.exec("UPDATE pull_request_links SET fetch_error = NULL, fetched_at = NULL WHERE task_id IN (SELECT id FROM tasks WHERE project_id = ?)", args.id);
  ctx.activity("project.github_token", "project", args.id);
  ctx.emit({ entity: "project", op: "upsert", row: getProject(ctx, args.id) });
  const links = all(ctx.sql, toPullRequestLink, "SELECT p.* FROM pull_request_links p JOIN tasks t ON t.id = p.task_id WHERE t.project_id = ? AND t.deleted_at IS NULL", args.id);
  for (const row of links) ctx.emit({ entity: "pullRequestLink", op: "upsert", row });
}
