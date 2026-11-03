import type { CommandArgs } from "../../../shared/commands";
import { parsePullRequestUrl } from "../../../shared/github";
import { CommandContext, CommandError } from "../context";
import { one, toPullRequestLink } from "../rows";
export function requireTask(ctx: CommandContext, taskId: string) {
  if (!ctx.sql.exec("SELECT id FROM tasks WHERE id = ? AND deleted_at IS NULL", taskId).toArray().length) throw new CommandError("not_found", "Task not found");
}
export function link(ctx: CommandContext, args: CommandArgs<"pr.link">) {
  requireTask(ctx, args.taskId);
  const existing = one(ctx.sql, toPullRequestLink, "SELECT * FROM pull_request_links WHERE id = ?", args.id);
  if (existing) {
    if (existing.taskId !== args.taskId || existing.url !== args.url) throw new CommandError("conflict", "Pull Request link id is already in use");
    return;
  }
  if (ctx.sql.exec("SELECT id FROM pull_request_links WHERE task_id = ? AND url = ?", args.taskId, args.url).toArray().length) return;
  const parsed = parsePullRequestUrl(args.url);
  ctx.sql.exec("INSERT INTO pull_request_links (id, task_id, url, owner, repo, number, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args.id, args.taskId, parsed.url, parsed.owner, parsed.repo, parsed.number, ctx.actorId, ctx.now);
  ctx.activity("pr.linked", "task", args.taskId, { url: parsed.url });
  ctx.emit({ entity: "pullRequestLink", op: "upsert", row: one(ctx.sql, toPullRequestLink, "SELECT * FROM pull_request_links WHERE id = ?", args.id)! });
}
export function unlink(ctx: CommandContext, args: CommandArgs<"pr.unlink">) {
  const row = one(ctx.sql, toPullRequestLink, "SELECT * FROM pull_request_links WHERE id = ?", args.id);
  if (!row) return;
  requireTask(ctx, row.taskId);
  ctx.sql.exec("DELETE FROM pull_request_links WHERE id = ?", row.id);
  ctx.activity("pr.unlinked", "task", row.taskId, { url: row.url });
  ctx.emit({ entity: "pullRequestLink", op: "delete", row: { id: row.id } });
}
