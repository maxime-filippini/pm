import { SortableTaskList } from "@/components/SortableTaskList";
import { PageHeader, SectionHeader } from "@/components/PageHeader";
import { useParams } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { TASK_STATUSES, type Task, type TaskStatus } from "../../shared/entities";
import { uuidv7 } from "../../shared/ids";
import { byRank } from "../../shared/rank";
import { Empty, SectionHeading, ShowClosedToggle, STATUS_LABEL } from "@/components/common";
import { TaskCard, TaskList } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";

const useProject = (key: string) => useWorkspace((s) => Object.values(s.view.projects).find((p) => p.key === key));

export function ProjectTasksPage() {
  const { slug, key } = useParams({ from: "/w/$slug/p/$key/" });
  const socket = useSocket();
  const project = useProject(key);
  const allTasks = useWorkspace((s) => s.view.tasks);
  const members = useWorkspace((s) => s.view.members);
  const me = useWorkspace((s) => s.memberId);
  const [title, setTitle] = useState("");
  const features = useWorkspace((s) => s.view.features);
  const [featureId, setFeatureId] = useState("");
  const [assignee, setAssignee] = useState<string>("");
  const [showClosed, setShowClosed] = useState(false);
  useEffect(() => setFeatureId(""), [project?.id]);

  const groups = useMemo(() => {
    if (!project) return [];
    const tasks = Object.values(allTasks)
      .filter((t) => t.projectId === project.id)
      .filter((t) => !featureId || (featureId === "none" ? t.featureId === null : t.featureId === featureId))
      .filter((t) => !assignee || (assignee === "none" ? t.assigneeId === null : t.assigneeId === assignee))
      .sort(byRank);
    const statuses: TaskStatus[] = showClosed ? [...TASK_STATUSES] : ["in_progress", "todo"];
    return statuses.map((status) => ({ status, tasks: tasks.filter((t) => t.status === status) }));
  }, [allTasks, project, assignee, showClosed, featureId]);

  if (!project) return null;
  const archived = project.archivedAt !== null;

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket.send("task.create", { id: uuidv7(), projectId: project.id, title, featureId: featureId && featureId !== "none" ? featureId : null, assigneeId: assignee && assignee !== "none" ? assignee : undefined })) {
      setTitle("");
    }
  };
  const reorder = (task: Task, rank: string) => socket.send("task.move", { id: task.id, rank });

  const activeMembers = Object.values(members).filter((m) => m.active).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <PageHeader title="Tasks" description="Organize the work, assign ownership and track progress." />

      {archived && <p className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">This Project is archived. Unarchive it to add Tasks.</p>}

      <div className="space-y-10">
        {!archived && (
          <section aria-label="Add a Task" className="space-y-4 border-l border-border/60 pl-5">
            <SectionHeader title="Add a Task" description="Start with a short title. Add details after creating the Task." />
            <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row">
              <Input className="min-w-0 flex-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" aria-label="New Task title" maxLength={200} />
              <Button type="submit" disabled={!title.trim()}><PlusIcon /> Add Task</Button>
            </form>
            {(featureId || assignee) && <p className="text-xs leading-relaxed text-muted-foreground">New Tasks use the selected Feature and assignee filters.</p>}
          </section>
        )}

        <section aria-label="Current Tasks" className="min-w-0 space-y-6">
          <div className="space-y-4">
            <SectionHeader title="Current Tasks" description="Filter the list, open a Task, or reorder work within a status." />
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <NativeSelect value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assignee filter">
                <NativeSelectOption value="">Anyone</NativeSelectOption>
                {me && <NativeSelectOption value={me}>Me</NativeSelectOption>}
                <NativeSelectOption value="none">Unassigned</NativeSelectOption>
                {activeMembers.filter((m) => m.id !== me).map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.name}</NativeSelectOption>)}
              </NativeSelect>
              <NativeSelect className="max-w-full" value={featureId} onChange={(e) => setFeatureId(e.target.value)} aria-label="Feature filter">
                <NativeSelectOption value="">All Features</NativeSelectOption>
                <NativeSelectOption value="none">Standalone Tasks</NativeSelectOption>
                {Object.values(features).filter((f) => f.projectId === project.id).map((f) => <NativeSelectOption key={f.id} value={f.id}>{f.title}</NativeSelectOption>)}
              </NativeSelect>
              <ShowClosedToggle checked={showClosed} onChange={setShowClosed} />
            </div>
          </div>

          {groups.map(({ status, tasks }) => (
            <section key={status} className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{STATUS_LABEL[status]} <span className="font-normal">{tasks.length}</span></h3>
              {tasks.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">No Tasks in this view.</p>
              ) : (
                <SortableTaskList slug={slug} project={project} tasks={tasks} onReorder={reorder} />
              )}
            </section>
          ))}
        </section>
      </div>
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
      <PageHeader title="My Tasks" description="Focus on work assigned to you in this Project. In-progress Tasks appear first; completed work stays available through the toggle." />
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
