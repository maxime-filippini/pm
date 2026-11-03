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
import { type CSSProperties, type ReactNode, type Ref, useState } from "react";
import { rankForMove, rankForReorder } from "../../shared/rank";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** What a sortable row spreads onto its root element, plus pieces it places itself. */
export type SortableRowProps = {
  ref?: Ref<HTMLLIElement>;
  style?: CSSProperties;
  onMouseDown?: React.MouseEventHandler<HTMLLIElement>;
  className: string;
  /** Grip for keyboard dragging (hidden on touch screens). Put it first in the row. */
  handle: ReactNode;
  /** Up/down buttons, shown on touch screens only. */
  moveButtons: ReactNode;
};

type Ranked = { id: string; rank: string };

type Props<T extends Ranked> = {
  /** Already sorted by rank. */
  items: T[];
  /** Spoken by screen readers while dragging, e.g. "WEB-3 Write landing copy". */
  label: (item: T) => string;
  onReorder: (item: T, rank: string) => void;
  renderItem: (item: T, row: SortableRowProps) => ReactNode;
};

/**
 * A list you can reorder. With a mouse, drag any row: it lifts and the others slide out of the
 * way. With a keyboard, focus the grip and use Space + arrows. Touch screens get up/down buttons
 * instead, so dragging never fights with scrolling.
 */
export function SortableList<T extends Ranked>({ items, label, onReorder, renderItem }: Props<T>) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so clicking a link in a row still works.
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map((t) => t.id);
  const active = activeId ? items.find((t) => t.id === activeId) : undefined;

  type DragRef = { id: string | number };
  const name = (id: string | number) => {
    const item = items.find((x) => x.id === id);
    return item ? label(item) : "item";
  };
  const announcements = {
    onDragStart: ({ active }: { active: DragRef }) => `Picked up ${name(active.id)}.`,
    onDragOver: ({ active, over }: { active: DragRef; over: DragRef | null }) => (over ? `${name(active.id)} is over ${name(over.id)}.` : undefined),
    onDragEnd: ({ active, over }: { active: DragRef; over: DragRef | null }) =>
      over ? `Dropped ${name(active.id)} at the position of ${name(over.id)}.` : `Dropped ${name(active.id)}.`,
    onDragCancel: ({ active }: { active: DragRef }) => `Cancelled moving ${name(active.id)}.`,
  };

  const reorder = (from: number, to: number) => {
    const rank = rankForReorder(items, from, to);
    if (rank) onReorder(items[from]!, rank);
  };
  const move = (index: number, direction: -1 | 1) => {
    const rank = rankForMove(items, index, direction);
    if (rank) onReorder(items[index]!, rank);
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
          {items.map((item, i) => (
            <SortableRow
              key={item.id}
              item={item}
              label={label(item)}
              renderItem={renderItem}
              onMoveUp={i > 0 ? () => move(i, -1) : undefined}
              onMoveDown={i < items.length - 1 ? () => move(i, 1) : undefined}
            />
          ))}
        </ul>
      </SortableContext>
      <DragOverlay modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}>
        {active ? (
          <ul>
            {renderItem(active, {
              className: "scale-[1.02] cursor-grabbing shadow-xl ring-2 ring-ring/40",
              handle: <GripVerticalIcon className="-ml-1 size-4 shrink-0 text-muted-foreground" />,
              moveButtons: null,
            })}
          </ul>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableRow<T extends Ranked>({ item, label, renderItem, onMoveUp, onMoveDown }: {
  item: T;
  label: string;
  renderItem: Props<T>["renderItem"];
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return renderItem(item, {
    ref: setNodeRef,
    style: { transform: CSS.Translate.toString(transform), transition },
    // Mouse drags start anywhere on the row; keyboard drags only from the grip (so Enter on a link still works).
    onMouseDown: listeners?.onMouseDown as React.MouseEventHandler<HTMLLIElement> | undefined,
    className: cn("pointer-fine:cursor-grab pointer-fine:select-none", isDragging && "border-dashed bg-transparent opacity-40"),
    handle: (
      <button
        ref={setActivatorNodeRef}
        type="button"
        {...attributes}
        onKeyDown={listeners?.onKeyDown as React.KeyboardEventHandler<HTMLButtonElement> | undefined}
        aria-label={`Reorder ${label}`}
        className="-ml-1 hidden shrink-0 rounded text-muted-foreground/60 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-fine:inline-flex"
      >
        <GripVerticalIcon className="size-4" />
      </button>
    ),
    moveButtons: (
      <span className="flex shrink-0 pointer-fine:hidden">
        <Button variant="ghost" size="icon-sm" aria-label="Move up" disabled={!onMoveUp} onClick={onMoveUp} className="disabled:invisible">
          <ChevronUpIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Move down" disabled={!onMoveDown} onClick={onMoveDown} className="disabled:invisible">
          <ChevronDownIcon />
        </Button>
      </span>
    ),
  });
}
