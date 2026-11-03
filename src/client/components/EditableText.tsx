import { useEffect, useState } from "react";
import type { Ref } from "../../shared/entities";
import { useSocket } from "../sync/context";
import { useWorkspace } from "../store/workspace";
import { EditingMembers, useEditingTarget } from "./Presence";
import { Button } from "./ui/button";

type FieldProps = {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
};
/** Autosave never overwrites a remote change before the Member chooses what to keep. */
export function EditableText({ value, onSave, render, multiline, field = "title", target: explicit }: {
  value: string; onSave: (v: string) => void; render: (p: FieldProps) => React.ReactNode;
  multiline?: boolean; field?: string; target?: Ref;
}) {
  const socket = useSocket(), context = useEditingTarget(), target = explicit ?? context;
  const [draft, setDraft] = useState<string | null>(null), [base, setBase] = useState(value), [showTheirs, setShowTheirs] = useState(false);
  const conflict = draft !== null && value !== base && value !== draft;
  const presence = useWorkspace((s) => s.presence), members = useWorkspace((s) => s.view.members);
  const events = useWorkspace((s) => s.lastActivity);
  const actor = events.find((a) => a.targetType === target?.type && a.targetId === target?.id)?.actorId;
  const other = presence.find((p) => p.editing?.ref.type === target?.type && p.editing?.ref.id === target?.id && p.editing?.field === field);
  useEffect(() => () => { if (target) socket.presence({ editing: null }); }, [socket, target?.type, target?.id]);
  const save = () => {
    if (target) socket.presence({ editing: null });
    if (conflict) return;
    if (draft !== null && draft !== value && (multiline || draft.trim())) onSave(draft);
    setDraft(null);
  };
  return <div className="min-w-0 space-y-2">
    <EditingMembers target={target} field={field} />
    {render({
      value: draft ?? value,
      onFocus: () => {
        if (draft === null) { setDraft(value); setBase(value); }
        if (target) socket.presence({ editing: { ref: target, field } });
      },
      onChange: (e) => { if (draft === null) setBase(value); setDraft(e.target.value); },
      onBlur: save,
      onKeyDown: (e) => {
        if (e.key === "Escape") { setDraft(null); setShowTheirs(false); if (target) socket.presence({ editing: null }); }
        if (e.key === "Enter" && !multiline) (e.target as HTMLElement).blur();
      },
    })}
    {conflict && <div role="alert" className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm" onMouseDown={(e) => e.preventDefault()}>
      <p>{actor ? members[actor]?.name ?? "Someone" : other ? members[other.memberId]?.name ?? "Someone" : "Someone"} changed this while you were editing.</p>
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant="outline" onClick={() => setShowTheirs(true)}>View theirs</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { setBase(value); setShowTheirs(false); }}>Keep mine</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setDraft(null); setBase(value); setShowTheirs(false); }}>Use theirs</Button></div>
      {showTheirs && <p className="whitespace-pre-wrap break-words">{value || "(empty)"}</p>}
    </div>}
  </div>;
}
