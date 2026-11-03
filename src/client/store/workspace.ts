import { create } from "zustand";
import type { Command } from "../../shared/commands";
import type { Activity, Comment, CommentTarget, Change, Feature, Meeting, Member, Project, Task, Topic } from "../../shared/entities";
import { commentChange, commentKey, commentPage, newCollection, projectComments, type CommentCollection } from "./comments";
import type { CommentsPage, Snapshot } from "../../shared/protocol";
import { applyOptimistic } from "../sync/optimistic";

export type Data = {
  members: Record<string, Member>;
  projects: Record<string, Project>;
  features: Record<string, Feature>;
  tasks: Record<string, Task>;
  topics: Record<string, Topic>;
  meetings: Record<string, Meeting>;
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
  lastActivity: Activity[];
  commentCollections: Record<string, CommentCollection>;
  comments: Record<string, Comment[]>;
  connectionEpoch: number;
};

const empty: Data = { members: {}, projects: {}, features: {}, tasks: {}, topics: {}, meetings: {} };

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
  lastActivity: [],
  commentCollections: {}, comments: {}, connectionEpoch: 0,
}));

const set = (patch: Partial<State> | ((s: State) => Partial<State>)) =>
  useWorkspace.setState((s) => {
    const next = { ...s, ...(typeof patch === "function" ? patch(s) : patch) };
    return { ...next, view: project(next), comments: Object.fromEntries(Object.entries(next.commentCollections).map(([key, c]) => [key, projectComments(c, next.pending, next.memberId ?? "")])) };
  });

export const workspaceActions = {
  reset() {
    useWorkspace.setState({ status: "connecting", memberId: null, version: 0, confirmed: empty, pending: [], view: empty, activity: null, lastActivity: [], commentCollections: {}, comments: {}, connectionEpoch: 0 });
  },
  setStatus(status: ConnectionStatus) {
    useWorkspace.setState({ status });
  },
  /** A fresh snapshot replaces everything; pending commands stay and are re-applied on top. */
  snapshot(version: number, memberId: string, data: Snapshot) {
    set((s) => ({
      connectionEpoch: s.connectionEpoch + 1,
      commentCollections: Object.fromEntries(Object.entries(s.commentCollections).map(([key, c]) => [key, newCollection(c.target)])),
      version,
      memberId,
      status: "online",
      activity: null,
      lastActivity: [],
      confirmed: {
        members: byId(data.members),
        projects: byId(data.projects),
        features: byId(data.features),
        tasks: byId(data.tasks),
        topics: byId(data.topics),
        meetings: byId(data.meetings),
      },
    }));
  },
  change(version: number, changes: Change[]) {
    set((s) => {
      if (version <= s.version) return {}; // stale
      const confirmed = { ...s.confirmed };
      let activity = s.activity;
      let commentCollections = s.commentCollections;
      for (const c of changes) {
        if (c.entity === "comment") {
          commentCollections = Object.fromEntries(Object.entries(commentCollections).map(([key, collection]) => [key, commentChange(collection, c, version)]));
          continue;
        }
        if (c.entity === "activity") {
          if (activity && c.op === "upsert") activity = [c.row, ...activity.filter((a) => a.id !== c.row.id)];
          continue;
        }
        const table = { ...confirmed[`${c.entity}s` as keyof Data] } as Record<string, unknown>;
        if (c.op === "delete") delete table[c.row.id];
        else table[c.row.id] = c.row;
        (confirmed as Record<string, unknown>)[`${c.entity}s`] = table;
      }
      return { version, confirmed, activity, commentCollections, lastActivity: changes.flatMap((c) => c.entity === "activity" && c.op === "upsert" ? [c.row] : []) };
    });
  },
  addPending(p: Pending) {
    set((s) => ({ pending: [...s.pending, p] }));
  },
  removePending(id: string) {
    set((s) => ({ pending: s.pending.filter((p) => p.id !== id) }));
  },
  loadComments(target: CommentTarget) {
    set((s) => ({ commentCollections: { ...s.commentCollections, [commentKey(target)]: newCollection(target) } }));
  },
  unloadComments(target: CommentTarget) {
    set((s) => {
      const { [commentKey(target)]: _, ...commentCollections } = s.commentCollections;
      return { commentCollections };
    });
  },
  commentsPage(target: CommentTarget, page: CommentsPage, version: number, epoch: number, generation: symbol) {
    set((s) => {
      const key = commentKey(target), collection = s.commentCollections[key];
      if (!collection || collection.generation !== generation || s.connectionEpoch !== epoch) return {};
      return { commentCollections: { ...s.commentCollections, [key]: commentPage(collection, page, version) } };
    });
  },
  setActivity(items: Activity[], append: boolean) {
    useWorkspace.setState((s) => ({ activity: append && s.activity ? [...s.activity, ...items] : items }));
  },
};
