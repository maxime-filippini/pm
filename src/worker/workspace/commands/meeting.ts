import type { CommandArgs } from "../../../shared/commands";
import { taskKey } from "../../../shared/entities";
import { CommandContext, CommandError } from "../context";
import { all, GROUP_BY_MEETING, MEETING_SELECT, one, toActivity, toFeature, toMeeting, toMember, toTask, toTopic } from "../rows";
import { getProject } from "./project";
import * as feature from "./feature";
import * as task from "./task";
import { emitTopic, getTopic } from "./topic";

/** A live (not deleted) Meeting. */
function getMeeting(ctx: CommandContext, id: string) {
  const meeting = one(ctx.sql, toMeeting, `${MEETING_SELECT} WHERE m.id = ? AND m.deleted_at IS NULL ${GROUP_BY_MEETING}`, id);
  if (!meeting) throw new CommandError("not_found", "Meeting not found");
  return meeting;
}

function emitMeeting(ctx: CommandContext, id: string) {
  ctx.emit({ entity: "meeting", op: "upsert", row: getMeeting(ctx, id) });
}

function openMeeting(ctx: CommandContext, projectId: string) {
  return one(ctx.sql, toMeeting, `${MEETING_SELECT} WHERE m.project_id = ? AND m.ended_at IS NULL AND m.deleted_at IS NULL ${GROUP_BY_MEETING}`, projectId);
}

/** Outcomes can only change while the Topic's Project has an open Meeting. */
function requireOpenMeeting(ctx: CommandContext, projectId: string) {
  const meeting = openMeeting(ctx, projectId);
  if (!meeting) throw new CommandError("invalid", "Start a Meeting first");
  return meeting;
}

/** A Topic resolved in an earlier, closed Meeting is part of that Meeting's record and can't change. */
function topicForOutcome(ctx: CommandContext, topicId: string) {
  const topic = getTopic(ctx, topicId);
  const meeting = requireOpenMeeting(ctx, topic.projectId);
  if (topic.resolvedInMeetingId !== null && topic.resolvedInMeetingId !== meeting.id) {
    throw new CommandError("conflict", "This Topic was resolved in an earlier Meeting");
  }
  return { topic, meeting };
}

function setOutcome(ctx: CommandContext, topicId: string, meetingId: string, outcome: string) {
  ctx.sql.exec(
    "UPDATE topics SET outcome = ?, resolved_in_meeting_id = ?, resolved_at = ? WHERE id = ?",
    outcome, meetingId, ctx.now, topicId,
  );
}

export function start(ctx: CommandContext, args: CommandArgs<"meeting.start">) {
  if (one(ctx.sql, toMeeting, `${MEETING_SELECT} WHERE m.id = ? ${GROUP_BY_MEETING}`, args.id)) return; // idempotent retry
  const project = getProject(ctx, args.projectId);
  if (project.archivedAt !== null) throw new CommandError("invalid", "Project is archived");
  if (openMeeting(ctx, project.id)) throw new CommandError("conflict", "A Meeting is already in progress");

  ctx.sql.exec("INSERT INTO meetings (id, project_id, started_at, started_by) VALUES (?, ?, ?, ?)", args.id, project.id, ctx.now, ctx.actorId);
  // Attendees default to every active Member.
  for (const m of all(ctx.sql, toMember, "SELECT * FROM members WHERE active = 1")) {
    ctx.sql.exec("INSERT INTO meeting_attendees (meeting_id, member_id) VALUES (?, ?)", args.id, m.id);
  }
  ctx.activity("meeting.started", "meeting", args.id, { projectId: project.id });
  emitMeeting(ctx, args.id);
}

export function setAttendees(ctx: CommandContext, args: CommandArgs<"meeting.setAttendees">) {
  const meeting = getMeeting(ctx, args.id);
  if (meeting.endedAt !== null) throw new CommandError("invalid", "This Meeting is closed");
  const ids = [...new Set(args.memberIds)].sort();
  for (const id of ids) {
    if (!one(ctx.sql, toMember, "SELECT * FROM members WHERE id = ?", id)) throw new CommandError("invalid", "Unknown Member");
  }
  if (ids.join() === meeting.attendeeIds.join()) return;
  ctx.sql.exec("DELETE FROM meeting_attendees WHERE meeting_id = ?", meeting.id);
  for (const id of ids) ctx.sql.exec("INSERT INTO meeting_attendees (meeting_id, member_id) VALUES (?, ?)", meeting.id, id);
  ctx.activity("meeting.attendees", "meeting", meeting.id, { from: meeting.attendeeIds, to: ids });
  emitMeeting(ctx, meeting.id);
}

export function recordOutcome(ctx: CommandContext, args: CommandArgs<"meeting.recordOutcome">) {
  const { topic, meeting } = topicForOutcome(ctx, args.topicId);
  if (topic.outcome === args.outcome) return;
  setOutcome(ctx, topic.id, meeting.id, args.outcome);
  ctx.activity("topic.resolved", "topic", topic.id, { meetingId: meeting.id, outcome: args.outcome });
  emitTopic(ctx, topic.id);
}

export function clearOutcome(ctx: CommandContext, args: CommandArgs<"meeting.clearOutcome">) {
  const { topic } = topicForOutcome(ctx, args.topicId);
  if (topic.resolvedAt === null) return;
  ctx.sql.exec("UPDATE topics SET outcome = NULL, resolved_in_meeting_id = NULL, resolved_at = NULL WHERE id = ?", topic.id);
  ctx.activity("topic.reopened", "topic", topic.id);
  emitTopic(ctx, topic.id);
}

/** Creates the Task and adds a line like "Created WEB-12 for Alice" to the Topic's Outcome, atomically. */
export function createTask(ctx: CommandContext, args: CommandArgs<"meeting.createTask">) {
  if (one(ctx.sql, toTask, "SELECT * FROM tasks WHERE id = ?", args.taskId)) return; // idempotent retry
  const { topic, meeting } = topicForOutcome(ctx, args.topicId);
  task.create(ctx, { id: args.taskId, projectId: topic.projectId, title: args.title, assigneeId: args.assigneeId });

  const created = one(ctx.sql, toTask, "SELECT * FROM tasks WHERE id = ?", args.taskId)!;
  const project = getProject(ctx, topic.projectId);
  const assignee = args.assigneeId ? one(ctx.sql, toMember, "SELECT * FROM members WHERE id = ?", args.assigneeId) : null;
  const line = `Created ${taskKey(project, created)}${assignee ? ` for ${assignee.name}` : ""}`;
  const outcome = topic.outcome ? `${topic.outcome}\n${line}` : line;
  setOutcome(ctx, topic.id, meeting.id, outcome);
  ctx.activity("topic.resolved", "topic", topic.id, { meetingId: meeting.id, outcome, taskId: created.id });
  emitTopic(ctx, topic.id);
}

export function close(ctx: CommandContext, args: CommandArgs<"meeting.close">) {
  const meeting = getMeeting(ctx, args.id);
  if (meeting.endedAt !== null) return; // already closed
  // Topics without an Outcome stay unresolved and carry over to the next Meeting.
  ctx.sql.exec("UPDATE meetings SET ended_at = ?, ended_by = ? WHERE id = ?", ctx.now, ctx.actorId, meeting.id);
  const resolved = ctx.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM topics WHERE resolved_in_meeting_id = ?", meeting.id).toArray()[0]!.n;
  ctx.activity("meeting.closed", "meeting", meeting.id, { projectId: meeting.projectId, resolved });
  emitMeeting(ctx, meeting.id);
}

type ResolvedTopic = { id: string; outcome: string; resolvedAt: number };

/**
 * Hides the Meeting. If it was still open it's closed too, so a new one can start. Topics resolved
 * in it go back on the agenda; their Outcomes are kept in the Activity entry so restore can put them back.
 */
export function remove(ctx: CommandContext, args: CommandArgs<"meeting.delete">) {
  const row = ctx.sql.exec<{ deleted_at: number | null }>("SELECT deleted_at FROM meetings WHERE id = ?", args.id).toArray()[0];
  if (!row) throw new CommandError("not_found", "Meeting not found");
  if (row.deleted_at !== null) return; // already deleted
  const meeting = getMeeting(ctx, args.id);

  const topics = all(ctx.sql, toTopic, "SELECT * FROM topics WHERE resolved_in_meeting_id = ?", meeting.id);
  const resolved: ResolvedTopic[] = topics.map((t) => ({ id: t.id, outcome: t.outcome ?? "", resolvedAt: t.resolvedAt ?? ctx.now }));
  ctx.sql.exec("UPDATE topics SET outcome = NULL, resolved_in_meeting_id = NULL, resolved_at = NULL WHERE resolved_in_meeting_id = ?", meeting.id);
  ctx.sql.exec(
    "UPDATE meetings SET deleted_at = ?, deleted_by = ?, ended_at = COALESCE(ended_at, ?), ended_by = COALESCE(ended_by, ?) WHERE id = ?",
    ctx.now, ctx.actorId, ctx.now, ctx.actorId, meeting.id,
  );
  ctx.activity("meeting.deleted", "meeting", meeting.id, { projectId: meeting.projectId, topics: resolved });
  ctx.emit({ entity: "meeting", op: "delete", row: { id: meeting.id } });
  for (const t of topics) emitTopic(ctx, t.id);
}

/** Brings the Meeting back (closed) and re-resolves its Topics that are still unresolved. */
export function restore(ctx: CommandContext, args: CommandArgs<"meeting.restore">) {
  const row = ctx.sql.exec<{ deleted_at: number | null }>("SELECT deleted_at FROM meetings WHERE id = ?", args.id).toArray()[0];
  if (!row) throw new CommandError("not_found", "Meeting not found");
  if (row.deleted_at === null) return; // not deleted
  ctx.sql.exec("UPDATE meetings SET deleted_at = NULL, deleted_by = NULL WHERE id = ?", args.id);

  const deletion = one(
    ctx.sql, toActivity,
    "SELECT * FROM activity WHERE kind = 'meeting.deleted' AND target_id = ? ORDER BY at DESC, id DESC LIMIT 1", args.id,
  );
  const topics = (deletion?.data.topics ?? []) as ResolvedTopic[];
  const restored: string[] = [];
  for (const t of topics) {
    // Skip Topics resolved again since (in another Meeting) or deleted.
    const current = one(ctx.sql, toTopic, "SELECT * FROM topics WHERE id = ?", t.id);
    if (!current || current.resolvedAt !== null) continue;
    ctx.sql.exec("UPDATE topics SET outcome = ?, resolved_in_meeting_id = ?, resolved_at = ? WHERE id = ?", t.outcome, args.id, t.resolvedAt, t.id);
    restored.push(t.id);
  }
  ctx.activity("meeting.restored", "meeting", args.id, { topics: restored.length });
  emitMeeting(ctx, args.id);
  for (const id of restored) emitTopic(ctx, id);
}

/** The Feature and its Outcome are committed together, just like meeting.createTask. */
export function createFeature(ctx: CommandContext, args: CommandArgs<"meeting.createFeature">) {
  if (one(ctx.sql, toFeature, "SELECT * FROM features WHERE id = ?", args.featureId)) return;
  const { topic, meeting } = topicForOutcome(ctx, args.topicId);
  feature.create(ctx, { id: args.featureId, projectId: topic.projectId, title: args.title, description: args.description ?? topic.body });
  const line = `Proposed Feature: ${args.title}`;
  const outcome = topic.outcome ? `${topic.outcome}\n${line}` : line;
  setOutcome(ctx, topic.id, meeting.id, outcome);
  ctx.activity("topic.resolved", "topic", topic.id, { meetingId: meeting.id, outcome, featureId: args.featureId });
  emitTopic(ctx, topic.id);
}
