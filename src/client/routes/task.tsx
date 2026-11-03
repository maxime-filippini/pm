import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TASK_STATUSES, type TaskStatus } from "../../shared/entities";
import { Card, Empty, Input, Select, STATUS_LABEL, Textarea } from "../components/ui";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";

export function TaskPage() {
  const { slug, taskKey } = useParams({ from: "/w/$slug/t/$taskKey" });
  const socket = useSocket();
  const [projectKey, numberStr] = splitKey(taskKey);
  const project = useWorkspace((s) => Object.values(s.view.projects).find((p) => p.key === projectKey));
  const task = useWorkspace((s) => (project ? Object.values(s.view.tasks).find((t) => t.projectId === project.id && t.number === Number(numberStr)) : undefined));
  const members = useWorkspace((s) => s.view.members);

  if (!project || !task) return <Empty>No Task {taskKey}.</Empty>;

  const creator = members[task.createdBy]?.name ?? "someone";
  const assignable = Object.values(members).filter((m) => m.active || m.id === task.assigneeId).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <div className="text-sm text-neutral-500">
        <Link to="/w/$slug/p/$key" params={{ slug, key: project.key }} className="hover:underline">{project.name}</Link>
        <span className="mx-2">/</span>
        <span className="font-mono">{taskKey}</span>
      </div>

      <EditableText
        value={task.title}
        onSave={(title) => socket.send("task.update", { id: task.id, title })}
        render={(p) => <Input {...p} className="text-lg font-semibold" />}
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-neutral-500">Status</span>
          <Select value={task.status} onChange={(e) => socket.send("task.setStatus", { id: task.id, status: e.target.value as TaskStatus })}>
            {TASK_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </Select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-neutral-500">Assignee</span>
          <Select value={task.assigneeId ?? ""} onChange={(e) => socket.send("task.update", { id: task.id, assigneeId: e.target.value || null })}>
            <option value="">Unassigned</option>
            {assignable.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </label>
      </div>

      <Card className="p-3">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Description</h2>
        <EditableText
          value={task.description}
          onSave={(description) => socket.send("task.update", { id: task.id, description })}
          render={(p) => <Textarea {...p} placeholder="Add a description…" />}
          multiline
        />
      </Card>

      <p className="text-xs text-neutral-500">
        Created by {creator} on {new Date(task.createdAt).toLocaleString()}
        {task.completedAt && ` · Done ${new Date(task.completedAt).toLocaleString()}`}
      </p>
    </div>
  );
}

function splitKey(key: string): [string, string] {
  const i = key.lastIndexOf("-");
  return [key.slice(0, i), key.slice(i + 1)];
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
