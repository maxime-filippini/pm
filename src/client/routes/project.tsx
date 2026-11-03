import { Outlet, useParams } from "@tanstack/react-router";
import { ArchiveIcon, ArchiveRestoreIcon, MoreHorizontalIcon, PencilIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TASK_STATUSES, type Task, type TaskStatus } from "../../shared/entities";
import { uuidv7 } from "../../shared/ids";
import { byRank } from "../../shared/rank";
import { Empty, SectionHeading, ShowClosedToggle, STATUS_LABEL } from "@/components/common";
import { SortableTaskList } from "@/components/SortableTaskList";
import { TaskCard, TaskList } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { setLastProject } from "../last-project";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";

/** Every page inside a Project renders here, under the Project nav in the top bar. */
export function ProjectLayout() {
  const { slug, key } = useParams({ from: "/w/$slug/p/$key" });
  const exists = useWorkspace((s) => Object.values(s.view.projects).some((p) => p.key === key));
  useEffect(() => setLastProject(slug, exists ? key : null), [slug, key, exists]);
  if (!exists) return <Empty>No Project with key {key}.</Empty>;
  return <Outlet />;
}

const useProject = (key: string) => useWorkspace((s) => Object.values(s.view.projects).find((p) => p.key === key));

export function ProjectTasksPage() {
  const { slug, key } = useParams({ from: "/w/$slug/p/$key/" });
  const socket = useSocket();
  const project = useProject(key);
  const allTasks = useWorkspace((s) => s.view.tasks);
  const members = useWorkspace((s) => s.view.members);
  const me = useWorkspace((s) => s.memberId);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [showClosed, setShowClosed] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);

  const groups = useMemo(() => {
    if (!project) return [];
    const tasks = Object.values(allTasks)
      .filter((t) => t.projectId === project.id)
      .filter((t) => !assignee || (assignee === "none" ? t.assigneeId === null : t.assigneeId === assignee))
      .sort(byRank);
    const statuses: TaskStatus[] = showClosed ? [...TASK_STATUSES] : ["in_progress", "todo"];
    return statuses.map((status) => ({ status, tasks: tasks.filter((t) => t.status === status) }));
  }, [allTasks, project, assignee, showClosed]);

  if (!project) return null;
  const archived = project.archivedAt !== null;

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket.send("task.create", { id: uuidv7(), projectId: project.id, title, assigneeId: assignee && assignee !== "none" ? assignee : undefined })) {
      setTitle("");
    }
  };
  const reorder = (task: Task, rank: string) => socket.send("task.move", { id: task.id, rank });

  const activeMembers = Object.values(members).filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2">
        {renaming === null ? (
          <h1 className="min-w-0 flex-1 truncate font-heading text-xl font-semibold" onDoubleClick={() => setRenaming(project.name)}>{project.name}</h1>
        ) : (
          <form
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (renaming.trim()) socket.send("project.rename", { id: project.id, name: renaming });
              setRenaming(null);
            }}
          >
            <Input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} onBlur={() => setRenaming(null)} onKeyDown={(e) => e.key === "Escape" && setRenaming(null)} />
          </form>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Project actions"><MoreHorizontalIcon /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setRenaming(project.name)}><PencilIcon /> Rename</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => socket.send(archived ? "project.unarchive" : "project.archive", { id: project.id })}>
              {archived ? <><ArchiveRestoreIcon /> Unarchive</> : <><ArchiveIcon /> Archive</>}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {archived && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">This Project is archived. Unarchive it to add Tasks.</p>}

      {!archived && (
        <form onSubmit={create} className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New Task title" className="h-9" />
          <Button type="submit" className="h-9" disabled={!title.trim()}><PlusIcon /> Add</Button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-4 text-sm">
        <NativeSelect value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee filter">
          <NativeSelectOption value="">Anyone</NativeSelectOption>
          {me && <NativeSelectOption value={me}>Me</NativeSelectOption>}
          <NativeSelectOption value="none">Unassigned</NativeSelectOption>
          {activeMembers.filter((m) => m.id !== me).map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.name}</NativeSelectOption>)}
        </NativeSelect>
        <ShowClosedToggle checked={showClosed} onChange={setShowClosed} />
      </div>

      {groups.map(({ status, tasks }) => (
        <section key={status} className="space-y-2">
          <SectionHeading count={tasks.length}>{STATUS_LABEL[status]}</SectionHeading>
          {tasks.length === 0 ? (
            <p className="rounded-lg border border-dashed px-3 py-2.5 text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            <SortableTaskList slug={slug} project={project} tasks={tasks} onReorder={reorder} />
          )}
        </section>
      ))}
    </div>
  );
}

/** Tasks in this Project assigned to me. */
export function ProjectMyTasksPage() {
  const { slug, key } = useParams({ from: "/w/$slug/p/$key/me" });
  const project = useProject(key);
  const me = useWorkspace((s) => s.memberId);
  const allTasks = useWorkspace((s) => s.view.tasks);
  const [showClosed, setShowClosed] = useState(false);

  const groups = useMemo(() => {
    if (!project) return [];
    const mine = Object.values(allTasks).filter((t) => t.projectId === project.id && t.assigneeId === me).sort(byRank);
    const statuses: TaskStatus[] = showClosed ? [...TASK_STATUSES] : ["in_progress", "todo"];
    return statuses.map((status) => ({ status, tasks: mine.filter((t) => t.status === status) })).filter((g) => g.tasks.length > 0);
  }, [allTasks, project, me, showClosed]);

  if (!project) return null;

  return (
    <div className="space-y-5">
      <ShowClosedToggle checked={showClosed} onChange={setShowClosed} />
      {groups.length === 0 && <Empty>Nothing assigned to you in {project.name}.</Empty>}
      {groups.map(({ status, tasks }) => (
        <section key={status} className="space-y-2">
          <SectionHeading count={tasks.length}>{STATUS_LABEL[status]}</SectionHeading>
          <TaskList>
            {tasks.map((t) => <TaskCard key={t.id} slug={slug} task={t} project={project} />)}
          </TaskList>
        </section>
      ))}
    </div>
  );
}
