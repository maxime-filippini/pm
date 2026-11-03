import { Link } from "@tanstack/react-router";
import type { Project, Task } from "../../shared/entities";
import { taskKey } from "../../shared/entities";
import { useWorkspace } from "../store/workspace";
import { Avatar, StatusDot } from "./ui";

export function TaskRow({ slug, task, project, actions }: { slug: string; task: Task; project: Project; actions?: React.ReactNode }) {
  const assignee = useWorkspace((s) => (task.assigneeId ? s.view.members[task.assigneeId] : undefined));
  const key = taskKey(project, task);
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <StatusDot status={task.status} />
      <Link to="/w/$slug/t/$taskKey" params={{ slug, taskKey: key }} className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="shrink-0 font-mono text-xs text-neutral-500">{key}</span>
        <span className={task.status === "canceled" ? "truncate text-neutral-500 line-through" : "truncate"}>{task.title}</span>
      </Link>
      {actions}
      {assignee && <Avatar name={assignee.name} />}
    </li>
  );
}
