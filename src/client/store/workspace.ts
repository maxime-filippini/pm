import { create } from "zustand";
import type { Command } from "../../shared/commands";
import type { Activity, Change, Feature, Member, Project, Task } from "../../shared/entities";
import type { Snapshot } from "../../shared/protocol";
import { applyOptimistic } from "../sync/optimistic";

export type Data = {
  members: Record<string, Member>;
  projects: Record<string, Project>;
  features: Record<string, Feature>;
  tasks: Record<string, Task>;
};

export type Pending = { id: string; command: Command; at: number };

export type ConnectionStatus = "connecting" | "online" | "offline" | "removed";

type State = {
  status: ConnectionStatus;
  memberId: string | null;
  version: number;
  /** What the server has confirmed. */
  confirmed: Data;
  /** Commands sent but not yet acked, in send order. */
  pending: Pending[];
  /** confirmed + pending applied optimistically. What the UI reads. */
  view: Data;
  /** Loaded on demand (activity.list); live changes are applied only once loaded. */
  activity: Activity[] | null;
};

const empty: Data = { members: {}, projects: {}, features: {}, tasks: {} };

function byId<T extends { id: string }>(rows: T[]): Record<string, T> {
  return Object.fromEntries(rows.map((r) => [r.id, r]));
}

function project(state: Pick<State, "confirmed" | "pending" | "memberId">): Data {
  let data = state.confirmed;
  for (const p of state.pending) data = applyOptimistic(data, p.command, state.memberId ?? "", p.at);
  return data;
}

export const useWorkspace = create<State>(() => ({
  status: "connecting",
  memberId: null,
  version: 0,
  confirmed: empty,
  pending: [],
  view: empty,
  activity: null,
}));

const set = (patch: Partial<State> | ((s: State) => Partial<State>)) =>
  useWorkspace.setState((s) => {
    const next = { ...s, ...(typeof patch === "function" ? patch(s) : patch) };
    return { ...next, view: project(next) };
  });

export const workspaceActions = {
  reset() {
    useWorkspace.setState({ status: "connecting", memberId: null, version: 0, confirmed: empty, pending: [], view: empty, activity: null });
  },
  setStatus(status: ConnectionStatus) {
    useWorkspace.setState({ status });
  },
  /** A fresh snapshot replaces everything; pending commands stay and are re-applied on top. */
  snapshot(version: number, memberId: string, data: Snapshot) {
    set({
      version,
      memberId,
      status: "online",
      activity: null,
      confirmed: {
        members: byId(data.members),
        projects: byId(data.projects),
        features: byId(data.features),
        tasks: byId(data.tasks),
      },
    });
  },
  change(version: number, changes: Change[]) {
    set((s) => {
      if (version <= s.version) return {}; // stale
      const confirmed = { ...s.confirmed };
      let activity = s.activity;
      for (const c of changes) {
        if (c.entity === "activity") {
          if (activity && c.op === "upsert") activity = [c.row, ...activity.filter((a) => a.id !== c.row.id)];
          continue;
        }
        const table = { ...confirmed[`${c.entity}s` as keyof Data] } as Record<string, unknown>;
        if (c.op === "delete") delete table[c.row.id];
        else table[c.row.id] = c.row;
        (confirmed as Record<string, unknown>)[`${c.entity}s`] = table;
      }
      return { version, confirmed, activity };
    });
  },
  addPending(p: Pending) {
    set((s) => ({ pending: [...s.pending, p] }));
  },
  removePending(id: string) {
    set((s) => ({ pending: s.pending.filter((p) => p.id !== id) }));
  },
  setActivity(items: Activity[], append: boolean) {
    useWorkspace.setState((s) => ({ activity: append && s.activity ? [...s.activity, ...items] : items }));
  },
};
