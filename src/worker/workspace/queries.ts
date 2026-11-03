import type { z } from "zod";
import { querySchemas, type CommentsPage } from "../../shared/protocol";
import { requireCommentTarget } from "./commands/comment";
import type { Snapshot } from "../../shared/protocol";
import { all, GROUP_BY_MEETING, MEETING_SELECT, toComment, toActivity, toFeature, toMeeting, toMember, toProject, toTask, toTopic } from "./rows";

export function snapshot(sql: SqlStorage): Snapshot {
  return {
    members: all(sql, toMember, "SELECT * FROM members ORDER BY name"),
    projects: all(sql, toProject, "SELECT * FROM projects ORDER BY name"),
    features: all(sql, toFeature, "SELECT * FROM features"),
    tasks: all(sql, toTask, "SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY rank"),
    topics: all(sql, toTopic, "SELECT * FROM topics ORDER BY rank"),
    meetings: all(sql, toMeeting, `${MEETING_SELECT} WHERE m.deleted_at IS NULL ${GROUP_BY_MEETING} ORDER BY m.started_at`),
  };
}

export function activityList(sql: SqlStorage, args: z.infer<typeof querySchemas["activity.list"]>) {
  const where: string[] = [], params: SqlStorageValue[] = [];
  if (args.target) { where.push("target_type = ? AND target_id = ?"); params.push(args.target.type, args.target.id); }
  if (args.cursor) { where.push("(at < ? OR (at = ? AND id < ?))"); params.push(args.cursor.at, args.cursor.at, args.cursor.id); }
  if (args.before !== undefined) { where.push("at < ?"); params.push(args.before); }
  const rows = all(sql, toActivity, `SELECT * FROM activity ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY at DESC, id DESC LIMIT ?`, ...params, args.limit + 1);
  const items = rows.slice(0, args.limit).map((item) => {
    if (item.kind !== "task.deleted" && item.kind !== "meeting.deleted") return item;
    const table = item.targetType === "task" ? "tasks" : "meetings";
    const deleted = sql.exec(`SELECT id FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`, item.targetId).toArray().length > 0;
    const latest = sql.exec<{ id: string }>("SELECT id FROM activity WHERE target_type = ? AND target_id = ? AND kind IN (?, ?) ORDER BY at DESC, id DESC LIMIT 1", item.targetType, item.targetId, item.kind, item.targetType + ".restored").toArray()[0];
    return { ...item, canRestore: deleted && latest?.id === item.id };
  });
  const last = items.at(-1);
  return { items, nextCursor: rows.length > args.limit && last ? { at: last.at, id: last.id } : null };
}

export function commentsList(sql: SqlStorage, args: z.infer<typeof querySchemas["comments.list"]>): CommentsPage {
  requireCommentTarget(sql, args.target);
  const cursor = args.cursor;
  const rows = all(sql, toComment,
    `SELECT * FROM comments WHERE target_type = ? AND target_id = ?
    ${cursor ? "AND (created_at > ? OR (created_at = ? AND id > ?))" : ""}
    ORDER BY created_at ASC, id ASC LIMIT ?`,
    args.target.type, args.target.id, ...(cursor ? [cursor.createdAt, cursor.createdAt, cursor.id] : []), args.limit + 1);
  const items = rows.slice(0, args.limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > args.limit && last ? { createdAt: last.createdAt, id: last.id } : null };
}
