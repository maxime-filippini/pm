import type { Activity, Comment, Feature, Meeting, Member, Project, Task, Topic } from "../../shared/entities";

// Raw SQLite rows → the camelCase shapes sent to clients. Never expose github_token_enc.

type Row = Record<string, SqlStorageValue>;
const str = (v: unknown) => v as string;
const num = (v: unknown) => v as number;
const strOrNull = (v: unknown) => (v === null || v === undefined ? null : (v as string));
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : (v as number));

export const toMember = (r: Row): Member => ({
  id: str(r.id),
  email: str(r.email),
  name: str(r.name),
  active: r.active === 1,
});

export const toProject = (r: Row): Project => ({
  id: str(r.id),
  key: str(r.key),
  name: str(r.name),
  nextTaskNumber: num(r.next_task_number),
  hasGithubToken: r.github_token_enc != null,
  archivedAt: numOrNull(r.archived_at),
  createdAt: num(r.created_at),
  createdBy: str(r.created_by),
});

export const toFeature = (r: Row): Feature => ({
  id: str(r.id),
  projectId: str(r.project_id),
  title: str(r.title),
  description: str(r.description),
  status: str(r.status) as Feature["status"],
  decidedBy: strOrNull(r.decided_by),
  decidedAt: numOrNull(r.decided_at),
  createdBy: str(r.created_by),
  createdAt: num(r.created_at),
  updatedAt: num(r.updated_at),
});

export const toTask = (r: Row): Task => ({
  id: str(r.id),
  projectId: str(r.project_id),
  number: num(r.number),
  featureId: strOrNull(r.feature_id),
  title: str(r.title),
  description: str(r.description),
  status: str(r.status) as Task["status"],
  assigneeId: strOrNull(r.assignee_id),
  rank: str(r.rank),
  createdBy: str(r.created_by),
  createdAt: num(r.created_at),
  updatedAt: num(r.updated_at),
  completedAt: numOrNull(r.completed_at),
});

export const toTopic = (r: Row): Topic => ({
  id: str(r.id),
  projectId: str(r.project_id),
  title: str(r.title),
  body: str(r.body),
  refType: r.ref_type === "task" ? "task" : null,
  refId: strOrNull(r.ref_id),
  rank: str(r.rank),
  authorId: str(r.author_id),
  createdAt: num(r.created_at),
  outcome: strOrNull(r.outcome),
  resolvedInMeetingId: strOrNull(r.resolved_in_meeting_id),
  resolvedAt: numOrNull(r.resolved_at),
});

/** Expects an `attendee_ids` column: a JSON array built with json_group_array (see MEETING_SELECT). */
export const toMeeting = (r: Row): Meeting => ({
  id: str(r.id),
  projectId: str(r.project_id),
  startedAt: num(r.started_at),
  startedBy: str(r.started_by),
  endedAt: numOrNull(r.ended_at),
  endedBy: strOrNull(r.ended_by),
  attendeeIds: (JSON.parse(str(r.attendee_ids ?? "[]")) as Array<string | null>).filter((x): x is string => x !== null).sort(),
});

/** Meetings with their attendee ids. Append a WHERE on `m.` columns, then GROUP_BY_MEETING. */
export const MEETING_SELECT =
  "SELECT m.*, json_group_array(a.member_id) AS attendee_ids FROM meetings m LEFT JOIN meeting_attendees a ON a.meeting_id = m.id";
export const GROUP_BY_MEETING = "GROUP BY m.id";

export const toActivity = (r: Row): Activity => ({
  id: str(r.id),
  at: num(r.at),
  actorId: str(r.actor_id),
  via: strOrNull(r.via),
  kind: str(r.kind),
  targetType: str(r.target_type),
  targetId: str(r.target_id),
  data: JSON.parse(str(r.data)) as Record<string, unknown>,
});

export function one<T>(sql: SqlStorage, map: (r: Row) => T, query: string, ...params: SqlStorageValue[]): T | null {
  const row = sql.exec<Row>(query, ...params).toArray()[0];
  return row ? map(row) : null;
}

export function all<T>(sql: SqlStorage, map: (r: Row) => T, query: string, ...params: SqlStorageValue[]): T[] {
  return sql.exec<Row>(query, ...params).toArray().map(map);
}

export const toComment = (r: Row): Comment => ({
  id: str(r.id), targetType: str(r.target_type) as Comment["targetType"], targetId: str(r.target_id),
  authorId: str(r.author_id), via: strOrNull(r.via), body: str(r.body), createdAt: num(r.created_at), editedAt: numOrNull(r.edited_at),
});
