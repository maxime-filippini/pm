import type { Project, Task } from "../../shared/entities";
import { taskKey } from "../../shared/entities";
import { TaskCard } from "./TaskCard";
import { SortableList } from "./SortableList";

/** Task cards you can drag to reorder (see SortableList). */
export function SortableTaskList({ slug, project, tasks, onReorder }: {
  slug: string;
  project: Project;
  tasks: Task[];
  onReorder: (task: Task, rank: string) => void;
}) {
  return (
    <SortableList
      items={tasks}
      label={(t) => `${taskKey(project, t)} ${t.title}`}
      onReorder={onReorder}
      renderItem={(task, { handle, moveButtons, className, ...row }) => (
        <TaskCard key={task.id} {...row} className={className} slug={slug} task={task} project={project} leading={handle} actions={moveButtons} />
      )}
    />
  );
}

