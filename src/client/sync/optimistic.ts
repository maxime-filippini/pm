import type { Command } from "../../shared/commands";
import { type Feature, type Meeting, type Project, type Task, type Topic, taskKey } from "../../shared/entities";
import { generateKeyBetween } from "fractional-indexing";
import type { Data } from "../store/workspace";

/**
 * Predict a command's effect locally so the UI responds instantly. The server's
 * broadcast replaces this once it arrives; a reject simply drops it.
 */
export function applyOptimistic(data: Data, command: Command, memberId: string, now: number): Data {
  switch (command.name) {
    case "project.create": {
      const { id, key, name } = command.args;
      if (data.projects[id]) return data;
      const project: Project = { id, key, name, nextTaskNumber: 1, hasGithubToken: false, archivedAt: null, createdAt: now, createdBy: memberId };
      return { ...data, projects: { ...data.projects, [id]: project } };
    }
    case "project.rename":
      return patchProject(data, command.args.id, { name: command.args.name });
    case "project.archive":
      return patchProject(data, command.args.id, { archivedAt: now });
    case "project.unarchive":
      return patchProject(data, command.args.id, { archivedAt: null });

    case "feature.create": {
      const a = command.args;
      if (data.features[a.id] || !data.projects[a.projectId]) return data;
      const feature: Feature = { id: a.id, projectId: a.projectId, title: a.title, description: a.description ?? "", status: "proposed", decidedBy: null, decidedAt: null, createdBy: memberId, createdAt: now, updatedAt: now };
      return { ...data, features: { ...data.features, [a.id]: feature } };
    }
    case "feature.update": {
      const { id, ...fields } = command.args;
      const feature = data.features[id];
      const patch = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
      return feature ? { ...data, features: { ...data.features, [id]: { ...feature, ...patch, updatedAt: now } } } : data;
    }
    case "feature.setStatus": {
      const { id, status } = command.args;
      const feature = data.features[id];
      if (!feature || feature.status === status) return data;
      const decision = status === "accepted" || status === "rejected";
      return { ...data, features: { ...data.features, [id]: { ...feature, status, updatedAt: now, ...(decision && { decidedBy: memberId, decidedAt: now }) } } };
    }
    case "meeting.createFeature": {
      const a = command.args;
      const topic = data.topics[a.topicId];
      const meeting = openMeetingFor(data, topic?.projectId);
      if (!topic || !meeting || data.features[a.featureId]) return data;
      const next = applyOptimistic(data, { name: "feature.create", args: { id: a.featureId, projectId: topic.projectId, title: a.title, description: a.description ?? topic.body } }, memberId, now);
      const line = `Proposed Feature: ${a.title}`;
      return patchTopic(next, topic.id, { outcome: topic.outcome ? `${topic.outcome}\n${line}` : line, resolvedInMeetingId: meeting.id, resolvedAt: now });
    }
    case "task.create": {
      const a = command.args;
      const project = data.projects[a.projectId];
      if (data.tasks[a.id] || !project) return data;
      const last = Object.values(data.tasks)
        .filter((t) => t.projectId === a.projectId)
        .reduce<string | null>((max, t) => (max === null || t.rank > max ? t.rank : max), null);
      const status = a.status ?? "todo";
      const task: Task = {
        id: a.id,
        projectId: a.projectId,
        number: project.nextTaskNumber,
        featureId: a.featureId ?? null,
        title: a.title,
        description: a.description ?? "",
        status,
        assigneeId: a.assigneeId ?? null,
        rank: a.rank ?? generateKeyBetween(last, null),
        createdBy: memberId,
        createdAt: now,
        updatedAt: now,
        completedAt: status === "done" ? now : null,
      };
      return {
        ...data,
        tasks: { ...data.tasks, [a.id]: task },
        projects: { ...data.projects, [project.id]: { ...project, nextTaskNumber: project.nextTaskNumber + 1 } },
      };
    }
    case "task.update": {
      const { id, ...rest } = command.args;
      const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as Partial<Task>;
      return patchTask(data, id, { ...patch, updatedAt: now });
    }
    case "task.setStatus": {
      const { id, status } = command.args;
      return patchTask(data, id, { status, completedAt: status === "done" ? now : null, updatedAt: now });
    }
    case "task.move":
      return patchTask(data, command.args.id, { rank: command.args.rank });
    case "task.delete": {
      const { [command.args.id]: _, ...tasks } = data.tasks;
      return { ...data, tasks };
    }
    // Restores need the hidden row, which only the server has: wait for its change.
    case "task.restore":
    case "meeting.restore":
      return data;

    case "topic.create": {
      const a = command.args;
      if (data.topics[a.id] || !data.projects[a.projectId]) return data;
      const last = Object.values(data.topics)
        .filter((t) => t.projectId === a.projectId)
        .reduce<string | null>((max, t) => (max === null || t.rank > max ? t.rank : max), null);
      const topic: Topic = {
        id: a.id,
        projectId: a.projectId,
        title: a.title,
        body: a.body ?? "",
        refType: a.ref ? "task" : null,
        refId: a.ref?.id ?? null,
        rank: generateKeyBetween(last, null),
        authorId: memberId,
        createdAt: now,
        outcome: null,
        resolvedInMeetingId: null,
        resolvedAt: null,
      };
      return { ...data, topics: { ...data.topics, [a.id]: topic } };
    }
    case "topic.update": {
      const { id, title, body, ref } = command.args;
      return patchTopic(data, id, {
        ...(title !== undefined && { title }),
        ...(body !== undefined && { body }),
        ...(ref !== undefined && { refType: ref ? "task" : null, refId: ref?.id ?? null }),
      });
    }
    case "topic.move":
      return patchTopic(data, command.args.id, { rank: command.args.rank });
    case "topic.delete": {
      const { [command.args.id]: _, ...topics } = data.topics;
      return { ...data, topics };
    }

    case "meeting.start": {
      const { id, projectId } = command.args;
      if (data.meetings[id]) return data;
      const attendeeIds = Object.values(data.members).filter((m) => m.active).map((m) => m.id).sort();
      const meeting: Meeting = { id, projectId, startedAt: now, startedBy: memberId, endedAt: null, endedBy: null, attendeeIds };
      return { ...data, meetings: { ...data.meetings, [id]: meeting } };
    }
    case "meeting.setAttendees":
      return patchMeeting(data, command.args.id, { attendeeIds: [...new Set(command.args.memberIds)].sort() });
    case "meeting.close":
      return patchMeeting(data, command.args.id, { endedAt: now, endedBy: memberId });
    case "meeting.delete": {
      const { [command.args.id]: _, ...meetings } = data.meetings;
      const topics = Object.fromEntries(
        Object.entries(data.topics).map(([id, t]) =>
          [id, t.resolvedInMeetingId === command.args.id ? { ...t, outcome: null, resolvedInMeetingId: null, resolvedAt: null } : t],
        ),
      );
      return { ...data, meetings, topics };
    }
    case "meeting.recordOutcome": {
      const meeting = openMeetingFor(data, data.topics[command.args.topicId]?.projectId);
      if (!meeting) return data;
      return patchTopic(data, command.args.topicId, { outcome: command.args.outcome, resolvedInMeetingId: meeting.id, resolvedAt: now });
    }
    case "meeting.clearOutcome":
      return patchTopic(data, command.args.topicId, { outcome: null, resolvedInMeetingId: null, resolvedAt: null });
    case "meeting.createTask": {
      const a = command.args;
      const topic = data.topics[a.topicId];
      const project = topic && data.projects[topic.projectId];
      const meeting = openMeetingFor(data, topic?.projectId);
      if (!topic || !project || !meeting || data.tasks[a.taskId]) return data;
      const withTask = applyOptimistic(data, { name: "task.create", args: { id: a.taskId, projectId: project.id, title: a.title, assigneeId: a.assigneeId } }, memberId, now);
      const assignee = a.assigneeId ? data.members[a.assigneeId] : undefined;
      const line = `Created ${taskKey(project, { number: project.nextTaskNumber })}${assignee ? ` for ${assignee.name}` : ""}`;
      return patchTopic(withTask, topic.id, { outcome: topic.outcome ? `${topic.outcome}\n${line}` : line, resolvedInMeetingId: meeting.id, resolvedAt: now });
    }
  }
}

function openMeetingFor(data: Data, projectId: string | undefined): Meeting | undefined {
  return projectId ? Object.values(data.meetings).find((m) => m.projectId === projectId && m.endedAt === null) : undefined;
}

function patchTopic(data: Data, id: string, patch: Partial<Topic>): Data {
  const topic = data.topics[id];
  return topic ? { ...data, topics: { ...data.topics, [id]: { ...topic, ...patch } } } : data;
}

function patchMeeting(data: Data, id: string, patch: Partial<Meeting>): Data {
  const meeting = data.meetings[id];
  return meeting ? { ...data, meetings: { ...data.meetings, [id]: { ...meeting, ...patch } } } : data;
}

function patchProject(data: Data, id: string, patch: Partial<Project>): Data {
  const project = data.projects[id];
  return project ? { ...data, projects: { ...data.projects, [id]: { ...project, ...patch } } } : data;
}

function patchTask(data: Data, id: string, patch: Partial<Task>): Data {
  const task = data.tasks[id];
  return task ? { ...data, tasks: { ...data.tasks, [id]: { ...task, ...patch } } } : data;
}
