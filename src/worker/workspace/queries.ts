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

export function activityList(sql: SqlStorage, args: { before?: number; limit: number }) {
  const items =
    args.before === undefined
      ? all(sql, toActivity, "SELECT * FROM activity ORDER BY at DESC, id DESC LIMIT ?", args.limit)
      : all(sql, toActivity, "SELECT * FROM activity WHERE at < ? ORDER BY at DESC, id DESC LIMIT ?", args.before, args.limit);
  return { items };
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
