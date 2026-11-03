import { createContext, useContext, useEffect, type ReactNode } from "react";
import type { Ref } from "../../shared/entities";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";

export const EditingRef = createContext<Ref | null>(null);
export function Viewing({ target, children }: { target: Ref; children: ReactNode }) {
  const socket = useSocket();
  useEffect(() => {
    socket.presence({ viewing: target, editing: null });
    return () => socket.presence({ viewing: null, editing: null });
  }, [socket, target.type, target.id]);
  return <EditingRef.Provider value={target}><Viewers target={target} />{children}</EditingRef.Provider>;
}
export function Viewers({ target }: { target: Ref }) {
  const presence = useWorkspace((s) => s.presence), members = useWorkspace((s) => s.view.members);
  const names = [...new Set(presence.filter((p) => p.viewing?.type === target.type && p.viewing.id === target.id).map((p) => members[p.memberId]?.name).filter(Boolean))];
  if (!names.length) return null;
  return <p className="text-xs text-muted-foreground" aria-live="polite">Viewing: {names.join(", ")}</p>;
}
export function useEditingTarget() { return useContext(EditingRef); }
export function EditingMembers({ target, field }: { target: Ref | null; field: string }) {
  const presence = useWorkspace((s) => s.presence), members = useWorkspace((s) => s.view.members);
  const me = useWorkspace((s) => s.memberId);
  const names = [...new Set(presence.filter((p) => p.memberId !== me && p.editing?.ref.type === target?.type && p.editing?.ref.id === target?.id && p.editing?.field === field).map((p) => members[p.memberId]?.name).filter(Boolean))];
  return names.length ? <p className="text-xs text-amber-400">{names.join(", ")} editing…</p> : null;
}
