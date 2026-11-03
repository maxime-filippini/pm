import { Link } from "@tanstack/react-router";
import type { LiHTMLAttributes } from "react";
import type { Project, Task } from "../../shared/entities";
import { taskKey } from "../../shared/entities";
import { useWorkspace } from "../store/workspace";
import { Avatar, cx, StatusDot } from "./ui";

type Props = {
  slug: string;
  task: Task;
  project: Project;
  actions?: React.ReactNode;
  /** Extra props for the row, e.g. drag handlers. */
  rowProps?: LiHTMLAttributes<HTMLLIElement>;
};

export function TaskRow({ slug, task, project, actions, rowProps }: Props) {
  const assignee = useWorkspace((s) => (task.assigneeId ? s.view.members[task.assigneeId] : undefined));
  const key = taskKey(project, task);
  return (
    <li {...rowProps} className={cx("flex items-center gap-3 px-3 py-3 sm:py-2", rowProps?.className)}>
      <StatusDot status={task.status} />
      <Link
        to="/w/$slug/p/$key/t/$number"
        params={{ slug, key: project.key, number: String(task.number) }}
        draggable={false}
        className="flex min-w-0 flex-1 items-baseline gap-2"
      >
        <span className="shrink-0 font-mono text-xs text-neutral-500">{key}</span>
        <span className={task.status === "canceled" ? "truncate text-neutral-500 line-through" : "truncate"}>{task.title}</span>
      </Link>
      {actions}
      {assignee && <Avatar name={assignee.name} />}
    </li>
  );
}
