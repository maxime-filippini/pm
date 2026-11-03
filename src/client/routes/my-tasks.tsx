import { useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Empty, SectionHeading, ShowClosedToggle } from "@/components/common";
import { TaskCard, TaskList } from "@/components/TaskCard";
import { useWorkspace } from "../store/workspace";
import { byRank } from "../../shared/rank";

export function MyTasksPage() {
  const { slug } = useParams({ from: "/w/$slug/me" });
  const me = useWorkspace((s) => s.memberId);
  const tasks = useWorkspace((s) => s.view.tasks);
  const projects = useWorkspace((s) => s.view.projects);
  const [showClosed, setShowClosed] = useState(false);

  const byProject = useMemo(() => {
    const mine = Object.values(tasks)
      .filter((t) => t.assigneeId === me && (showClosed || t.status === "todo" || t.status === "in_progress"))
      .sort(byRank);
    return Object.values(projects)
      .filter((p) => p.archivedAt === null)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({ project, tasks: mine.filter((t) => t.projectId === project.id).sort((a, b) => (a.status === "in_progress" ? 0 : 1) - (b.status === "in_progress" ? 0 : 1) || byRank(a, b)) }))
      .filter((g) => g.tasks.length > 0);
  }, [tasks, projects, me, showClosed]);

  return (
    <div className="space-y-5">
      <ShowClosedToggle checked={showClosed} onChange={setShowClosed} />
      {byProject.length === 0 && <Empty>Nothing assigned to you.</Empty>}
      {byProject.map(({ project, tasks }) => (
        <section key={project.id} className="space-y-2">
          <SectionHeading count={tasks.length}>{project.name}</SectionHeading>
          <TaskList>
            {tasks.map((t) => <TaskCard key={t.id} slug={slug} task={t} project={project} />)}
          </TaskList>
        </section>
      ))}
    </div>
  );
}
