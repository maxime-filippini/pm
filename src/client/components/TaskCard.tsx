import { Trash2Icon } from "lucide-react";
import { Button } from "./ui/button";
import { useSocket } from "../sync/context";
import { Link } from "@tanstack/react-router";
import type { ComponentProps, ReactNode } from "react";
import type { Project, Task } from "../../shared/entities";
import { taskKey } from "../../shared/entities";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../store/workspace";
import { deletedToast, MemberAvatar, StatusDot } from "./common";

type Props = ComponentProps<"li"> & {
  slug: string;
  task: Task;
  project: Project;
  /** Shown before the status dot, e.g. a drag handle. */
  leading?: ReactNode;
  /** Shown before the assignee, e.g. move buttons. */
  actions?: ReactNode;
};

/** One Task as a card in a list. Sortable lists pass dnd-kit's ref, style and listeners through. */
export function TaskCard({ slug, task, project, leading, actions, className, ...li }: Props) {
  const socket = useSocket();
  const assignee = useWorkspace((s) => (task.assigneeId ? s.view.members[task.assigneeId] : undefined));
  const key = taskKey(project, task);
  return (
    <li {...li} className={cn("group flex items-center gap-2 rounded-md px-2 py-3 text-sm transition-colors hover:bg-muted/40 sm:gap-3 sm:py-2.5", className)}>
      {leading}
      <StatusDot status={task.status} />
      <Link
        to="/w/$slug/p/$key/t/$number"
        params={{ slug, key: project.key, number: String(task.number) }}
        draggable={false}
        className="flex min-w-0 flex-1 items-baseline gap-2"
      >
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{key}</span>
        <span className={task.status === "canceled" ? "truncate text-muted-foreground line-through" : "truncate"}>{task.title}</span>
      </Link>
      {actions}
      {assignee && <MemberAvatar name={assignee.name} />}
      <Button
        type="button" variant="ghost" size="icon-sm"
        aria-label={`Delete ${key}`} title={`Delete ${key}`}
        className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          if (socket.send("task.delete", { id: task.id })) deletedToast(`Deleted ${key}`, () => socket.send("task.restore", { id: task.id }));
        }}
      ><Trash2Icon /></Button>
    </li>
  );
}

/** Plain, non-sortable list of Task cards. */
export function TaskList({ children }: { children: ReactNode }) {
  return <ul className="flex flex-col gap-1.5">{children}</ul>;
}
