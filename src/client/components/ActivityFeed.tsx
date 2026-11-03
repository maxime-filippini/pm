import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "@tanstack/react-router";
import type { ActivityItem, ActivityTarget } from "../../shared/entities";
import type { ActivityPage } from "../../shared/protocol";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";
import { Button } from "./ui/button";
import { SectionHeader } from "./PageHeader";

const matches = (item: ActivityItem, target?: ActivityTarget) => !target || (item.targetType === target.type && item.targetId === target.id);
const sort = (items: ActivityItem[]) => items.sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
export function ActivityFeed({ target }: { target?: ActivityTarget }) {
  const socket = useSocket();
  const epoch = useWorkspace((s) => s.connectionEpoch);
  const status = useWorkspace((s) => s.status);
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [cursor, setCursor] = useState<ActivityPage["nextCursor"]>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const live = useRef(new Map<string, ActivityItem>());
  const size = useRef(50);
  const generation = useRef(0);
  const targetKey = target ? target.type + ":" + target.id : "workspace";
  async function load(more = false) {
    const current = ++generation.current;
    setLoading(true); setError("");
    try {
      let next = more ? cursor : null;
      const collected: ActivityItem[] = [];
      const wanted = more ? 50 : size.current;
      do {
        const page: ActivityPage = await socket.query("activity.list", { target, ...(next && { cursor: next }), limit: Math.min(200, wanted - collected.length) });
        collected.push(...page.items); next = page.nextCursor;
      } while (next && collected.length < wanted);
      if (current !== generation.current) return;
      // A live insert arriving during this query stays at the front.
      setItems((old) => sort([...new Map([...(more ? old : []), ...collected, ...live.current.values()].map((item) => [item.id, item])).values()]));
      setCursor(next);
      size.current = Math.max(size.current, (more ? items.length : 0) + collected.length);
    } catch (e) {
      if (current === generation.current) setError(e instanceof Error ? e.message : "Could not load Activity");
    } finally { if (current === generation.current) setLoading(false); }
  }
  useEffect(() => {
    generation.current++; live.current.clear(); size.current = 50; setItems([]); setCursor(null);
    return () => { generation.current++; };
  }, [targetKey, epoch]);
  useEffect(() => {
    // Activity is collected only while a feed is mounted.
    return useWorkspace.subscribe((state, previous) => {
      if (state.version === previous.version || !state.lastActivity.length) return;
      for (const item of state.lastActivity) {
        if (matches(item, target)) {
          live.current.set(item.id, item);
          setItems((old) => sort([item, ...old.filter((a) => a.id !== item.id)]));
        }
        if (/^(task|meeting)\.(deleted|restored)$/.test(item.kind)) {
          generation.current++; // Invalidate queries immediately, before the refresh effect runs.
          // Eligibility is server-derived; clear stale actions immediately and reload.
          setItems((old) => old.map((a) => a.targetType === item.targetType && a.targetId === item.targetId ? { ...a, canRestore: false } : a));
          live.current.forEach((a, id) => { if (a.targetType === item.targetType && a.targetId === item.targetId) live.current.delete(id); });
          setRevision((n) => n + 1);
        }
      }
    });
  }, [targetKey]);
  useEffect(() => { if (status === "online") void load(); }, [targetKey, epoch, status, revision]);
  return <section className="space-y-4 border-l border-border/60 pl-5">
    <SectionHeader title="Activity" description="Who changed what, and when. Deleted Tasks and Meetings can be restored here." />
    <ol className="divide-y">{items.map((item) => <ActivityRow key={item.id} item={item} />)}</ol>
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading Activity…</p>}
    {error && <p role="alert" className="text-sm">{error} <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button></p>}
    {!loading && !error && !items.length && <p className="text-sm text-muted-foreground">No Activity yet.</p>}
    {cursor && <Button variant="outline" disabled={loading} onClick={() => void load(true)}>Load more</Button>}
  </section>;
}
function ActivityRow({ item }: { item: ActivityItem }) {
  const { slug } = useParams({ strict: false });
  const data = useWorkspace((s) => s.view);
  const socket = useSocket();
  const member = data.members[item.actorId]?.name ?? "Former Member";
  const task = data.tasks[item.targetId], feature = data.features[item.targetId], topic = data.topics[item.targetId], meeting = data.meetings[item.targetId];
  const project = data.projects[item.targetId] ?? data.projects[task?.projectId ?? feature?.projectId ?? topic?.projectId ?? meeting?.projectId ?? String(item.data.projectId ?? "")];
  let label = String(item.data.title ?? item.data.key ?? item.targetType);
  let href: string | null = null;
  const base = slug && project ? `/w/${encodeURIComponent(slug)}/p/${project.key}` : null;
  if (base) {
    if (item.targetType === "task" && task) { label = `${project!.key}-${task.number}: ${task.title}`; href = base + "/t/" + task.number; }
    if (item.targetType === "feature" && feature) { label = feature.title; href = base + "/features/" + feature.id; }
    if (item.targetType === "project") { label = project!.name; href = base; }
    if (item.targetType === "meeting" && meeting) { label = "Meeting " + new Date(meeting.startedAt).toLocaleDateString(); href = base + "/meetings/" + meeting.id; }
    if (item.targetType === "topic" && topic) { label = topic.title; href = base + "/meetings" + (topic.resolvedInMeetingId ? "/" + topic.resolvedInMeetingId : "") + "#topic-" + topic.id; }
  }
  const action = item.kind === "project.github_token" ? "updated GitHub access for" : item.kind === "pr.state" ? "refreshed Pull Request state for" : item.kind.split(".").slice(1).join(" ").replaceAll("_", " ");
  const field = typeof item.data.field === "string" ? item.data.field : null;
  const fieldLabel = field ? ({ assigneeId: "Assignee", featureId: "Feature", title: "Title", description: "Description", status: "Status", name: "Name" } as Record<string, string>)[field] ?? "Details" : null;
  const describeValue = (value: unknown): string => {
    if (field === "assigneeId") return value ? data.members[String(value)]?.name ?? "Former Member" : "Unassigned";
    if (field === "featureId") return value ? data.features[String(value)]?.title ?? "Feature" : "Standalone Task";
    if (field === "status") return ({ todo: "Todo", in_progress: "In progress", done: "Done", canceled: "Canceled", proposed: "Proposed", accepted: "Accepted", rejected: "Rejected" } as Record<string, string>)[String(value)] ?? String(value);
    return String(value ?? "none");
  };
  return <li className="space-y-1 py-3 text-sm">
    <p><span className="font-medium">{member}</span>{item.via && <span className="text-muted-foreground"> via {item.via}</span>} · {item.kind.startsWith("comment.") ? "Comment " : ""}{action} {href ? <Link to={href} className="underline">{label}</Link> : <span>{label}{item.kind.endsWith(".deleted") && " (deleted)"}</span>}</p>
    {fieldLabel && <p className="break-words text-muted-foreground">{fieldLabel}{item.data.to !== undefined && `: ${describeValue(item.data.from)} → ${describeValue(item.data.to)}`}</p>}
    <p className="text-xs text-muted-foreground"><time dateTime={new Date(item.at).toISOString()}>{new Date(item.at).toLocaleString()}</time></p>
    {item.canRestore && <Button size="sm" variant="outline" onClick={() => socket.send(item.targetType === "task" ? "task.restore" : "meeting.restore", { id: item.targetId })}>Restore {item.targetType === "task" ? "Task" : "Meeting"}</Button>}
  </li>;
}
