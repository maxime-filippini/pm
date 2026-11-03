import { useEffect, useState, type ReactNode } from "react";
import type { Ref } from "../../shared/entities";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";
import { EditingMembers, useEditingTarget } from "./Presence";
import { Button } from "./ui/button";

/** Guard explicit-save forms as well as the autosave fields. */
export function ConcurrentDraft({ value, draft, field, theirs, target: explicit, onUseTheirs, children }: {
  value: string; draft: string; field: string; theirs?: string; target?: Ref; onUseTheirs: () => void; children: ReactNode;
}) {
  const socket = useSocket(), context = useEditingTarget(), target = explicit ?? context;
  const [base, setBase] = useState(value), [show, setShow] = useState(false);
  useEffect(() => () => { if (target) socket.presence({ editing: null }); }, [socket, target?.type, target?.id]);
  const events = useWorkspace((s) => s.lastActivity), members = useWorkspace((s) => s.view.members);
  const actor = events.find((a) => a.targetType === target?.type && a.targetId === target?.id)?.actorId;
  const conflict = value !== base && draft !== value;
  return <div className="min-w-0 space-y-2" onFocusCapture={() => { if (target) socket.presence({ editing: { ref: target, field } }); }} onBlurCapture={() => { if (target) socket.presence({ editing: null }); }} onSubmitCapture={(e) => { if (conflict) { e.preventDefault(); e.stopPropagation(); } }}>
    <EditingMembers target={target} field={field} />
    {children}
    {conflict && <div role="alert" className="space-y-2 rounded-md border border-amber-500/40 p-3 text-sm">
      <p>{actor ? members[actor]?.name ?? "Someone" : "Someone"} changed this while you were editing.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setShow(true)}>View theirs</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => { setBase(value); setShow(false); }}>Keep mine</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { onUseTheirs(); setBase(value); setShow(false); }}>Use theirs</Button>
      </div>
      {show && <p className="whitespace-pre-wrap break-words">{theirs ?? (value || "(empty)")}</p>}
    </div>}
  </div>;
}
