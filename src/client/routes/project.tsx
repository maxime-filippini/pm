import { useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { TASK_STATUSES, type TaskStatus } from "../../shared/entities";
import { uuidv7 } from "../../shared/ids";
import { TaskRow } from "../components/TaskRow";
import { Button, Card, Empty, Input, Select, STATUS_LABEL } from "../components/ui";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";
import { byRank, rankForMove } from "../tasks";

export function ProjectPage() {
  const { slug, key } = useParams({ from: "/w/$slug/p/$key" });
  const socket = useSocket();
  const project = useWorkspace((s) => Object.values(s.view.projects).find((p) => p.key === key));
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
        <span className="font-mono text-sm text-neutral-500">{project.key}</span>
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
        <section key={status} className="space-y-2">
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
                    actions={
                      <span className="flex">
                        <MoveButton label="Move up" disabled={i === 0} onClick={() => move(tasks, i, -1)}>↑</MoveButton>
                        <MoveButton label="Move down" disabled={i === tasks.length - 1} onClick={() => move(tasks, i, 1)}>↓</MoveButton>
                      </span>
                    }
                  />
                ))}
              </ul>
            )}
          </Card>
        </section>
      ))}
    </div>
  );

  function move(tasks: typeof groups[number]["tasks"], index: number, direction: -1 | 1) {
    const rank = rankForMove(tasks, index, direction);
    if (rank) socket.send("task.move", { id: tasks[index]!.id, rank });
  }
}

function MoveButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="rounded px-1.5 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-100 disabled:invisible">
      {children}
    </button>
  );
}
