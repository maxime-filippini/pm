import type { CommandArgs } from "../../../shared/commands";
import { CommandContext, CommandError } from "../context";
import { one, toFeature } from "../rows";
import { getProject } from "./project";

function getFeature(ctx: CommandContext, id: string) {
  const feature = one(ctx.sql, toFeature, "SELECT * FROM features WHERE id = ?", id);
  if (!feature) throw new CommandError("not_found", "Feature not found");
  return feature;
}
function emit(ctx: CommandContext, id: string) {
  ctx.emit({ entity: "feature", op: "upsert", row: getFeature(ctx, id) });
}
export function create(ctx: CommandContext, args: CommandArgs<"feature.create">) {
  if (one(ctx.sql, toFeature, "SELECT * FROM features WHERE id = ?", args.id)) return;
  const project = getProject(ctx, args.projectId);
  if (project.archivedAt !== null) throw new CommandError("invalid", "Project is archived");
  ctx.sql.exec(`INSERT INTO features (id, project_id, title, description, status, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'proposed', ?, ?, ?)`, args.id, project.id, args.title, args.description ?? "", ctx.actorId, ctx.now, ctx.now);
  ctx.activity("feature.created", "feature", args.id, { title: args.title, projectId: project.id });
  emit(ctx, args.id);
}
export function update(ctx: CommandContext, args: CommandArgs<"feature.update">) {
  const feature = getFeature(ctx, args.id);
  let changed = false;
  for (const field of ["title", "description"] as const) {
    const to = args[field];
    if (to === undefined || to === feature[field]) continue;
    ctx.sql.exec(`UPDATE features SET ${field} = ?, updated_at = ? WHERE id = ?`, to, ctx.now, feature.id);
    ctx.activity("feature.updated", "feature", feature.id, field === "description" ? { field } : { field, from: feature[field], to });
    changed = true;
  }
  if (changed) emit(ctx, feature.id);
}
export function setStatus(ctx: CommandContext, args: CommandArgs<"feature.setStatus">) {
  const feature = getFeature(ctx, args.id);
  if (feature.status === args.status) return;
  const decision = args.status === "accepted" || args.status === "rejected";
  ctx.sql.exec("UPDATE features SET status = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?",
    args.status, decision ? ctx.actorId : feature.decidedBy, decision ? ctx.now : feature.decidedAt, ctx.now, feature.id);
  ctx.activity("feature.status", "feature", feature.id, { field: "status", from: feature.status, to: args.status });
  emit(ctx, feature.id);
}
