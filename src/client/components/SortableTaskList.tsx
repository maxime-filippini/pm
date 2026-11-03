import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToVerticalAxis, restrictToWindowEdges } from "@dnd-kit/modifiers";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDownIcon, ChevronUpIcon, GripVerticalIcon } from "lucide-react";
import { useState } from "react";
import { type Project, type Task, taskKey } from "../../shared/entities";
import { rankForMove, rankForReorder } from "../../shared/rank";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TaskCard } from "./TaskCard";

type Props = {
  slug: string;
  project: Project;
  /** Already sorted by rank. */
  tasks: Task[];
  onReorder: (task: Task, rank: string) => void;
};

/**
 * Task cards you can reorder. With a mouse, drag any card: it lifts and the others slide out of
 * the way. With a keyboard, focus the grip and use Space + arrows. Touch screens get up/down
 * buttons instead, so dragging never fights with scrolling.
 */
export function SortableTaskList({ slug, project, tasks, onReorder }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so clicking a Task still opens it.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = tasks.map((t) => t.id);
  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined;

  // Screen reader announcements name the Task instead of its id.
  const label = (id: string | number) => {
    const t = tasks.find((x) => x.id === id);
    return t ? `${taskKey(project, t)} ${t.title}` : "Task";
  };
  const announcements = {
    onDragStart: ({ active }: { active: { id: string | number } }) => `Picked up ${label(active.id)}.`,
    onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? `${label(active.id)} is over ${label(over.id)}.` : undefined,
    onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) =>
      over ? `Dropped ${label(active.id)} at the position of ${label(over.id)}.` : `Dropped ${label(active.id)}.`,
    onDragCancel: ({ active }: { active: { id: string | number } }) => `Cancelled moving ${label(active.id)}.`,
  };

  const reorder = (from: number, to: number) => {
    const rank = rankForReorder(tasks, from, to);
    if (rank) onReorder(tasks[from]!, rank);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveId(null);
    if (over) reorder(ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      accessibility={{ announcements }}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={({ active }) => setActiveId(String(active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ul className="flex flex-col gap-1.5">
          {tasks.map((task, i) => (
            <SortableTaskCard
              key={task.id}
              slug={slug}
              project={project}
              task={task}
              onMoveUp={i > 0 ? () => onMove(i, -1) : undefined}
              onMoveDown={i < tasks.length - 1 ? () => onMove(i, 1) : undefined}
            />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}>
        {active ? (
          <ul>
            <TaskCard
              slug={slug}
              project={project}
              task={active}
              leading={<GripVerticalIcon className="size-4 text-muted-foreground" />}
              className="scale-[1.02] cursor-grabbing shadow-xl ring-2 ring-ring/40"
            />
          </ul>
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  function onMove(index: number, direction: -1 | 1) {
    const rank = rankForMove(tasks, index, direction);
    if (rank) onReorder(tasks[index]!, rank);
  }
}

function SortableTaskCard({ slug, project, task, onMoveUp, onMoveDown }: {
  slug: string;
  project: Project;
  task: Task;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  return (
    <TaskCard
      ref={setNodeRef}
      slug={slug}
      project={project}
      task={task}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // Mouse drags start anywhere on the card; keyboard drags only from the grip (so Enter on the link still opens the Task).
      onMouseDown={listeners?.onMouseDown as React.MouseEventHandler<HTMLLIElement> | undefined}
      className={cn("pointer-fine:cursor-grab pointer-fine:select-none", isDragging && "border-dashed bg-transparent opacity-40")}
      leading={
        <button
          ref={setActivatorNodeRef}
          type="button"
          {...attributes}
          onKeyDown={listeners?.onKeyDown as React.KeyboardEventHandler<HTMLButtonElement> | undefined}
          aria-label={`Reorder ${task.title}`}
          className="-ml-1 hidden rounded text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-fine:inline-flex"
        >
          <GripVerticalIcon className="size-4" />
        </button>
      }
      actions={
        <span className="flex pointer-fine:hidden">
          <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={!onMoveUp} onClick={onMoveUp} className="disabled:invisible">
            <ChevronUpIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={!onMoveDown} onClick={onMoveDown} className="disabled:invisible">
            <ChevronDownIcon />
          </Button>
        </span>
      }
    />
  );
}
