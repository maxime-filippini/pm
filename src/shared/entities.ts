import { z } from "zod";

export const TASK_STATUSES = ["todo", "in_progress", "done", "canceled"] as const;
export const FEATURE_STATUSES = ["proposed", "accepted", "rejected", "done"] as const;

export const TaskStatus = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatus>;
export const FeatureStatus = z.enum(FEATURE_STATUSES);
export type FeatureStatus = z.infer<typeof FeatureStatus>;

export const Id = z.string().min(1).max(64);
export const ProjectKey = z.string().regex(/^[A-Z]{2,6}$/, "Project key must be 2–6 uppercase letters");
export const Rank = z.string().min(1).max(256);

export type Member = { id: string; email: string; name: string; active: boolean };

export type Project = {
  id: string;
  key: string;
  name: string;
  nextTaskNumber: number;
  hasGithubToken: boolean;
  archivedAt: number | null;
  createdAt: number;
  createdBy: string;
};

export type Feature = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: FeatureStatus;
  decidedBy: string | null;
  decidedAt: number | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
};

export type Task = {
  id: string;
  projectId: string;
  number: number;
  featureId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId: string | null;
  rank: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
};

/** A thing to talk about at the Project's next Meeting. Resolved once it has an Outcome. */
export type Topic = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  /** Optional reference to a Task in the same Project. */
  refType: "task" | null;
  refId: string | null;
  rank: string;
  authorId: string;
  createdAt: number;
  outcome: string | null;
  resolvedInMeetingId: string | null;
  resolvedAt: number | null;
};

export type Meeting = {
  id: string;
  projectId: string;
  startedAt: number;
  startedBy: string;
  endedAt: number | null;
  endedBy: string | null;
  attendeeIds: string[];
};

export type Activity = {
  id: string;
  at: number;
  actorId: string;
  via: string | null;
  kind: string;
  targetType: string;
  targetId: string;
  data: Record<string, unknown>;
};

/** Entities that live in the store, keyed by the `entity` field of a change. */
export type EntityMap = {
  member: Member;
  project: Project;
  feature: Feature;
  task: Task;
  topic: Topic;
  meeting: Meeting;
  activity: Activity;
};
export type EntityName = keyof EntityMap;

export type Change = {
  [E in EntityName]: { entity: E; op: "upsert"; row: EntityMap[E] } | { entity: E; op: "delete"; row: { id: string } };
}[EntityName];

export function taskKey(project: Pick<Project, "key">, task: Pick<Task, "number">): string {
  return `${project.key}-${task.number}`;
}
