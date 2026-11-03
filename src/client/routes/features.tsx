import { Viewing } from "@/components/Presence";
import { Markdown, MarkdownInput } from "@/components/Markdown";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Comments } from "@/components/Comments";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { FEATURE_STATUSES, type Feature, type FeatureStatus } from "../../shared/entities";
import { uuidv7 } from "../../shared/ids";
import { byRank } from "../../shared/rank";
import { Empty } from "@/components/common";
import { TaskCard, TaskList } from "@/components/TaskCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";
import { EditableText } from "@/components/EditableText";

export const FEATURE_LABEL: Record<FeatureStatus, string> = { proposed: "Proposed", accepted: "Accepted", rejected: "Rejected", done: "Done" };

export function FeatureDonePrompt({ feature }: { feature: Feature }) {
  const socket = useSocket();
  const tasks = useWorkspace((s) => s.view.tasks);
  const linked = Object.values(tasks).filter((t) => t.featureId === feature.id);
  if (feature.status !== "accepted" || linked.length === 0 || linked.some((t) => t.status === "todo" || t.status === "in_progress")) return null;
  return <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-3 text-sm">
    <span>All linked Tasks are done or canceled. Mark Feature done?</span>
    <Button size="sm" onClick={() => socket.send("feature.setStatus", { id: feature.id, status: "done" })}>Mark done</Button>
  </div>;
}

export function FeaturesPage() {
  const { slug, key } = useParams({ from: "/w/$slug/p/$key/features" });
  const socket = useSocket();
  const project = useWorkspace((s) => Object.values(s.view.projects).find((p) => p.key === key));
  const features = useWorkspace((s) => s.view.features);
  const tasks = useWorkspace((s) => s.view.tasks);
  const [title, setTitle] = useState("");
  if (!project) return null;
  const group = (status: FeatureStatus) => Object.values(features).filter((f) => f.projectId === project.id && f.status === status).sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id));
  const rows = (status: FeatureStatus) => group(status).map((f) => {
    const linked = Object.values(tasks).filter((t) => t.featureId === f.id);
    const closed = linked.filter((t) => t.status === "done" || t.status === "canceled").length;
    return <Card key={f.id} className="gap-2 px-4">
      <Link to="/w/$slug/p/$key/features/$featureId" params={{ slug, key, featureId: f.id }} className="break-words font-medium hover:underline">{f.title}</Link>
      <p className="text-xs text-muted-foreground">{closed}/{linked.length} Tasks done or canceled</p>
      <FeatureDonePrompt feature={f} />
    </Card>;
  });
  return <div className="space-y-5">
    <h1 className="font-heading text-xl font-semibold">Features</h1>
    {project.archivedAt === null && <form className="flex gap-2" onSubmit={(e) => {
      e.preventDefault();
      if (socket.send("feature.create", { id: uuidv7(), projectId: project.id, title })) setTitle("");
    }}><Input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-label="Feature title" placeholder="Propose a Feature" /><Button disabled={!title.trim()}>Propose</Button></form>}
    {(["proposed", "accepted"] as const).map((status) => <section key={status} className="space-y-2"><h2 className="font-semibold">{FEATURE_LABEL[status]} ({group(status).length})</h2>{group(status).length ? rows(status) : <Empty>No {status} Features.</Empty>}</section>)}
    {(["done", "rejected"] as const).map((status) => <details key={status} className="space-y-2"><summary className="cursor-pointer py-2 font-semibold">{FEATURE_LABEL[status]} ({group(status).length})</summary>{rows(status)}</details>)}
  </div>;
}

export function FeaturePage() {
  const { slug, key, featureId } = useParams({ from: "/w/$slug/p/$key/features/$featureId" });
  const socket = useSocket();
  const project = useWorkspace((s) => Object.values(s.view.projects).find((p) => p.key === key));
  const feature = useWorkspace((s) => s.view.features[featureId]);
  const tasks = useWorkspace((s) => s.view.tasks);
  const members = useWorkspace((s) => s.view.members);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  if (!project || !feature || feature.projectId !== project.id) return <Empty>Feature not found.</Empty>;
  const linked = Object.values(tasks).filter((t) => t.featureId === feature.id).sort(byRank);
  return <Viewing target={{ type: "feature", id: feature.id }}><div className="space-y-5">
    <Link to="/w/$slug/p/$key/features" params={{ slug, key }} className="text-sm text-muted-foreground hover:underline">← Features</Link>
    <EditableText value={feature.title} onSave={(title) => socket.send("feature.update", { id: feature.id, title })} render={(p) => <Input {...p} aria-label="Feature title" className="font-heading text-lg font-semibold" />} />
    <label className="flex flex-wrap items-center gap-2 text-sm">Status
      <NativeSelect value={feature.status} onChange={(e) => socket.send("feature.setStatus", { id: feature.id, status: e.target.value as FeatureStatus })}>
        {FEATURE_STATUSES.map((s) => <NativeSelectOption key={s} value={s}>{FEATURE_LABEL[s]}</NativeSelectOption>)}
      </NativeSelect>
    </label>
    {feature.decidedBy && feature.decidedAt !== null && <p className="text-xs text-muted-foreground">Last decision by {members[feature.decidedBy]?.name ?? "someone"} on {new Date(feature.decidedAt).toLocaleString()}</p>}
    <FeatureDonePrompt feature={feature} />
    <Card className="gap-2 px-4"><h2 className="font-semibold">Description</h2><EditableText field="description" value={feature.description} multiline onSave={(description) => socket.send("feature.update", { id: feature.id, description })} render={(p) => <MarkdownInput {...p} aria-label="Feature description" placeholder="Describe the proposal…" className="min-h-32" />} /></Card>
    <section className="space-y-3"><h2 className="font-semibold">Tasks ({linked.length})</h2>
      {project.archivedAt === null && <form className="space-y-2" onSubmit={(e) => {
        e.preventDefault();
        if (socket.send("task.create", { id: uuidv7(), projectId: project.id, featureId: feature.id, title, assigneeId: assigneeId || null })) setTitle("");
      }}>
        <Input aria-label="New Task title" placeholder="Break this Feature into a Task" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-wrap gap-2"><NativeSelect value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} aria-label="Task assignee"><NativeSelectOption value="">Unassigned</NativeSelectOption>{Object.values(members).filter((m) => m.active).map((m) => <NativeSelectOption key={m.id} value={m.id}>{m.name}</NativeSelectOption>)}</NativeSelect><Button disabled={!title.trim()}>Add Task</Button></div>
      </form>}
      <TaskList>{linked.map((t) => <TaskCard key={t.id} slug={slug} project={project} task={t} />)}</TaskList>
    </section>
    <Comments key={feature.id} target={{ type: "feature", id: feature.id }} />
      <ActivityFeed key={"activity-" + feature.id} target={{ type: "feature", id: feature.id }} />
  </div></Viewing>;
}
