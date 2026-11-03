import type { SearchResult } from "../../shared/entities";
import type { z } from "zod";
import { querySchemas, type CommentsPage } from "../../shared/protocol";
import { requireCommentTarget } from "./commands/comment";
import type { Snapshot } from "../../shared/protocol";
import { all, GROUP_BY_MEETING, MEETING_SELECT, toComment, toPullRequestLink, toActivity, toFeature, toMeeting, toMember, toProject, toTask, toTopic } from "./rows";

export function snapshot(sql: SqlStorage): Snapshot {
  return {
    members: all(sql, toMember, "SELECT * FROM members ORDER BY name"),
    projects: all(sql, toProject, "SELECT * FROM projects ORDER BY name"),
    features: all(sql, toFeature, "SELECT * FROM features"),
    tasks: all(sql, toTask, "SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY rank"),
    topics: all(sql, toTopic, "SELECT * FROM topics ORDER BY rank"),
    pullRequestLinks: all(sql, toPullRequestLink, "SELECT p.* FROM pull_request_links p JOIN tasks t ON t.id = p.task_id WHERE t.deleted_at IS NULL"),
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

/** Escape LIKE metacharacters so search text is always literal. */
export function search(sql: SqlStorage, args: z.infer<typeof querySchemas["search"]>): { items: SearchResult[] } {
  const escaped = args.text.replace(/[\\%_]/g, (char) => "\\" + char);
  const prefix = escaped + "%", contains = "%" + escaped + "%";
  const rows = sql.exec<{
    type: SearchResult["type"]; id: string; title: string; project_id: string; project_key: string;
    task_number: number | null; meeting_id: string | null; score: number;
  }>(`
    SELECT 'task' AS type, t.id AS id, t.title AS title, p.id AS project_id, p.key AS project_key, t.number AS task_number, NULL AS meeting_id,
      CASE WHEN (p.key || '-' || t.number) = ? COLLATE NOCASE THEN 0 WHEN t.title LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END AS score
      FROM tasks t JOIN projects p ON p.id = t.project_id
      WHERE p.archived_at IS NULL AND t.deleted_at IS NULL AND ((p.key || '-' || t.number) = ? COLLATE NOCASE OR t.title LIKE ? ESCAPE '\\')
    UNION ALL
    SELECT 'feature', f.id, f.title, p.id, p.key, NULL, NULL, CASE WHEN f.title LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END
      FROM features f JOIN projects p ON p.id = f.project_id
      WHERE p.archived_at IS NULL AND f.title LIKE ? ESCAPE '\\'
    UNION ALL
    SELECT 'topic', t.id, t.title, p.id, p.key, NULL, t.resolved_in_meeting_id, CASE WHEN t.title LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END
      FROM topics t JOIN projects p ON p.id = t.project_id LEFT JOIN meetings m ON m.id = t.resolved_in_meeting_id
      WHERE p.archived_at IS NULL AND (t.resolved_in_meeting_id IS NULL OR (m.id IS NOT NULL AND m.deleted_at IS NULL)) AND t.title LIKE ? ESCAPE '\\'
    ORDER BY score, type, id LIMIT ?`,
    args.text, prefix, args.text, contains, prefix, contains, prefix, contains, args.limit).toArray();
  return { items: rows.map((r) => ({
    type: r.type, id: r.id, title: r.title, projectId: r.project_id, projectKey: r.project_key,
    ...(r.type === "task" && { taskNumber: r.task_number! }),
    ...(r.type === "topic" && { meetingId: r.meeting_id }),
  })) };
}
