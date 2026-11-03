import { Outlet, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { TASK_STATUSES, type Project, type Task, type TaskStatus } from "../../shared/entities";
import { uuidv7 } from "../../shared/ids";
import { TaskRow } from "../components/TaskRow";
import { Button, Card, cx, Empty, Input, Select, STATUS_LABEL } from "../components/ui";
import { setLastProject } from "../last-project";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";
import { byRank, rankForMove, rankForReorder } from "../../shared/rank";

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

  if (!project) return <Empty>No Project with key {key}.</Empty>;
  const archived = project.archivedAt !== null;

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket.send("task.create", { id: uuidv7(), projectId: project.id, title, assigneeId: assignee && assignee !== "none" ? assignee : undefined })) {
      setTitle("");
    }
  };

  const activeMembers = Object.values(members).filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        {renaming === null ? (
          <h1 className="flex-1 text-xl font-semibold" onDoubleClick={() => setRenaming(project.name)}>{project.name}</h1>
        ) : (
          <form
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              socket.send("project.rename", { id: project.id, name: renaming });
              setRenaming(null);
            }}
          >
            <Input autoFocus value={renaming} onChange={(e) => setRenaming(e.target.value)} onBlur={() => setRenaming(null)} />
          </form>
        )}
        <Button variant="ghost" onClick={() => setRenaming(project.name)}>Rename</Button>
        <Button variant="ghost" onClick={() => socket.send(archived ? "project.unarchive" : "project.archive", { id: project.id })}>
          {archived ? "Unarchive" : "Archive"}
        </Button>
      </header>

      {archived && <p className="rounded-md bg-neutral-800 px-3 py-2 text-sm text-neutral-300">This Project is archived. Unarchive it to add Tasks.</p>}

      {!archived && (
        <form onSubmit={create} className="flex gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="New Task title" />
          <Button type="submit" variant="primary" disabled={!title.trim()}>Add</Button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
          <option value="">Anyone</option>
          {me && <option value={me}>Me</option>}
          <option value="none">Unassigned</option>
          {activeMembers.filter((m) => m.id !== me).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </Select>
        <label className="flex items-center gap-2 text-neutral-400">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          Show done and canceled
        </label>
      </div>

      {groups.map(({ status, tasks }) => (
        <TaskGroup key={status} slug={slug} project={project} status={status} tasks={tasks} onReorder={reorder} />
      ))}
    </div>
  );

  function reorder(rank: string | null, task: Task) {
    if (rank) socket.send("task.move", { id: task.id, rank });
  }
}

type DragState = { from: number; slot: number | null };

/** One status section. Drag to reorder with a mouse; up/down buttons on touch screens. */
function TaskGroup({ slug, project, status, tasks, onReorder }: {
  slug: string;
  project: Project;
  status: TaskStatus;
  tasks: Task[];
  onReorder: (rank: string | null, task: Task) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  // Slots are gaps between rows (0 = above the first). The two around the dragged row don't move it.
  const movesTo = (d: DragState) => (d.slot === null || d.slot === d.from || d.slot === d.from + 1 ? null : d.slot > d.from ? d.slot - 1 : d.slot);
  const target = drag ? movesTo(drag) : null;

  const rowProps = (i: number): React.LiHTMLAttributes<HTMLLIElement> => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tasks[i]!.id);
      setDrag({ from: i, slot: null });
    },
    onDragOver: (e) => {
      if (!drag) return; // Dragging from another section: not a drop target.
      e.preventDefault();
      const box = e.currentTarget.getBoundingClientRect();
      const slot = e.clientY < box.top + box.height / 2 ? i : i + 1;
      if (slot !== drag.slot) setDrag({ ...drag, slot });
    },
    onDrop: (e) => {
      e.preventDefault();
      if (drag && target !== null) onReorder(rankForReorder(tasks, drag.from, target), tasks[drag.from]!);
      setDrag(null);
    },
    onDragEnd: () => setDrag(null),
    className: cx(
      "group pointer-fine:cursor-grab",
      drag?.from === i && "opacity-40",
      target !== null && drag?.slot === i && "shadow-[inset_0_2px_0_0_var(--color-indigo-400)]",
      target !== null && drag?.slot === i + 1 && i === tasks.length - 1 && "shadow-[inset_0_-2px_0_0_var(--color-indigo-400)]",
    ),
  });

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {STATUS_LABEL[status]} <span className="font-normal">{tasks.length}</span>
      </h2>
      <Card>
        {tasks.length === 0 ? (
          <p className="px-3 py-2 text-sm text-neutral-600">Nothing here.</p>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {tasks.map((task, i) => (
              <TaskRow
                key={task.id}
                slug={slug}
                task={task}
                project={project}
                rowProps={rowProps(i)}
                actions={
                  <>
                    <span aria-hidden className="hidden select-none text-neutral-600 opacity-0 group-hover:opacity-100 pointer-fine:inline" title="Drag to reorder">⠿</span>
                    <span className="flex pointer-fine:hidden">
                      <MoveButton label="Move up" disabled={i === 0} onClick={() => onReorder(rankForMove(tasks, i, -1), task)}>↑</MoveButton>
                      <MoveButton label="Move down" disabled={i === tasks.length - 1} onClick={() => onReorder(rankForMove(tasks, i, 1), task)}>↓</MoveButton>
                    </span>
                  </>
                }
              />
            ))}
          </ul>
        )}
      </Card>
    </section>
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
      <label className="flex items-center gap-2 text-sm text-neutral-400">
        <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
        Show done and canceled
      </label>
      {groups.length === 0 && <Empty>Nothing assigned to you in {project.name}.</Empty>}
      {groups.map(({ status, tasks }) => (
        <section key={status} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {STATUS_LABEL[status]} <span className="font-normal">{tasks.length}</span>
          </h2>
          <Card>
            <ul className="divide-y divide-neutral-800">
              {tasks.map((t) => <TaskRow key={t.id} slug={slug} task={t} project={project} />)}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}

function MoveButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="rounded px-2.5 py-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100 disabled:invisible">
      {children}
    </button>
  );
}
