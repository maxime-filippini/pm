import { Link, Navigate, useCanGoBack, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TASK_STATUSES, type TaskStatus } from "../../shared/entities";
import { ArrowLeftIcon, MoreHorizontalIcon, Trash2Icon } from "lucide-react";
import { deletedToast, Empty, STATUS_LABEL } from "@/components/common";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";

/** /w/$slug/t/WEB-12 → /w/$slug/p/WEB/t/12 */
export function TaskKeyRedirect() {
  const { slug, taskKey } = useParams({ from: "/w/$slug/t/$taskKey" });
  const i = taskKey.lastIndexOf("-");
  if (i <= 0) return <Empty>No Task {taskKey}.</Empty>;
  return <Navigate to="/w/$slug/p/$key/t/$number" params={{ slug, key: taskKey.slice(0, i), number: taskKey.slice(i + 1) }} replace />;
}

export function TaskPage() {
  const { slug, key: projectKey, number } = useParams({ from: "/w/$slug/p/$key/t/$number" });
  const socket = useSocket();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();
  const taskKey = `${projectKey}-${number}`;
  const project = useWorkspace((s) => Object.values(s.view.projects).find((p) => p.key === projectKey));
  const task = useWorkspace((s) => (project ? Object.values(s.view.tasks).find((t) => t.projectId === project.id && t.number === Number(number)) : undefined));
  const members = useWorkspace((s) => s.view.members);

  if (!project || !task) return <Empty>No Task {taskKey}.</Empty>;

  const creator = members[task.createdBy]?.name ?? "someone";
  const remove = () => {
    if (!socket.send("task.delete", { id: task.id })) return;
    deletedToast(`Deleted ${taskKey}`, () => socket.send("task.restore", { id: task.id }));
    if (canGoBack) router.history.back();
    else navigate({ to: "/w/$slug/p/$key", params: { slug, key: project.key } });
  };
  const assignable = Object.values(members).filter((m) => m.active || m.id === task.assigneeId).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {/* Back returns to the list you came from (Tasks or My Tasks); a fresh tab falls back to Tasks. */}
        {canGoBack ? (
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => router.history.back()}><ArrowLeftIcon /> Back</Button>
        ) : (
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link to="/w/$slug/p/$key" params={{ slug, key: project.key }}><ArrowLeftIcon /> Tasks</Link>
          </Button>
        )}
        <span className="flex-1 font-mono">{taskKey}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Task actions"><MoreHorizontalIcon /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onSelect={remove}><Trash2Icon /> Delete Task</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <EditableText
        value={task.title}
        onSave={(title) => socket.send("task.update", { id: task.id, title })}
        render={(p) => <Input {...p} aria-label="Title" className="h-10 font-heading text-lg font-semibold md:text-lg" />}
      />

      <div className="flex flex-wrap gap-4 text-sm">
        <Label className="gap-2 font-normal">
          <span className="text-muted-foreground">Status</span>
          <NativeSelect value={task.status} onChange={(e) => socket.send("task.setStatus", { id: task.id, status: e.target.value as TaskStatus })}>
            {TASK_STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{STATUS_LABEL[s]}</NativeSelectOption>)}
          </NativeSelect>
        </Label>
        <Label className="gap-2 font-normal">
          <span className="text-muted-foreground">Assignee</span>
          <NativeSelect value={task.assigneeId ?? ""} onChange={(e) => socket.send("task.update", { id: task.id, assigneeId: e.target.value || null })}>
            <NativeSelectOption value="">Unassigned</NativeSelectOption>
            {assignable.map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.name}</NativeSelectOption>)}
          </NativeSelect>
        </Label>
      </div>

      <Card className="gap-2 px-4">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Description</h2>
        <EditableText
          value={task.description}
          onSave={(description) => socket.send("task.update", { id: task.id, description })}
          render={(p) => <Textarea {...p} placeholder="Add a description…" className="min-h-32" />}
          multiline
        />
      </Card>

      <p className="text-xs text-muted-foreground">
        Created by {creator} on {new Date(task.createdAt).toLocaleString()}
        {task.completedAt && ` · Done ${new Date(task.completedAt).toLocaleString()}`}
      </p>
    </div>
  );
}

type FieldProps = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
};

/** Local draft while focused; saves on blur (and Enter for single-line). Follows remote changes otherwise. */
function EditableText({ value, onSave, render, multiline }: { value: string; onSave: (v: string) => void; render: (p: FieldProps) => React.ReactNode; multiline?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => {
    if (draft === value) setDraft(null);
  }, [value, draft]);
  const save = () => {
    if (draft !== null && draft !== value && (multiline || draft.trim())) onSave(draft);
    setDraft(null);
  };
  return render({
    value: draft ?? value,
    onChange: (e) => setDraft(e.target.value),
    onBlur: save,
    onKeyDown: (e) => {
      if (e.key === "Escape") setDraft(null);
      if (e.key === "Enter" && !multiline) (e.target as HTMLElement).blur();
    },
  });
}
