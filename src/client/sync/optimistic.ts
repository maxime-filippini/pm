import type { Command } from "../../shared/commands";
import type { Project, Task } from "../../shared/entities";
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
  }
}

function patchProject(data: Data, id: string, patch: Partial<Project>): Data {
  const project = data.projects[id];
  return project ? { ...data, projects: { ...data.projects, [id]: { ...project, ...patch } } } : data;
}

function patchTask(data: Data, id: string, patch: Partial<Task>): Data {
  const task = data.tasks[id];
  return task ? { ...data, tasks: { ...data.tasks, [id]: { ...task, ...patch } } } : data;
}
