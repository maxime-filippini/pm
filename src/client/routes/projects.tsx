import { PageHeader, SectionHeader } from "@/components/PageHeader";
import { Link, useParams } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { uuidv7 } from "../../shared/ids";
import { Empty } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";

export function ProjectsPage() {
  const { slug } = useParams({ from: "/w/$slug/" });
  const socket = useSocket();
  const projects = useWorkspace((s) => s.view.projects);
  const tasks = useWorkspace((s) => s.view.tasks);
  const topics = useWorkspace((s) => s.view.topics);
  const meetings = useWorkspace((s) => s.view.meetings);
  const [showArchived, setShowArchived] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");

  const list = useMemo(
    () => Object.values(projects).filter((p) => showArchived || p.archivedAt === null).sort((a, b) => a.name.localeCompare(b.name)),
    [projects, showArchived],
  );
  const openCount = (projectId: string) =>
    Object.values(tasks).filter((t) => t.projectId === projectId && (t.status === "todo" || t.status === "in_progress")).length;

  const openTopics = (projectId: string) => Object.values(topics).filter((t) => t.projectId === projectId && t.resolvedAt === null).length;
  const meetingOpen = (projectId: string) => Object.values(meetings).some((m) => m.projectId === projectId && m.endedAt === null);

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket.send("project.create", { id: uuidv7(), key: key.trim().toUpperCase(), name })) {
      setKey("");
      setName("");
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Projects" description="Choose a Project to plan Features, organize Tasks and prepare your next Meeting." />
      <SectionHeader title="Your Projects" description="Each Project keeps its own Tasks, Features and Meetings." />
      {list.length === 0 ? (
        <Empty>No Projects yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {list.map((p) => (
            <li key={p.id}>
              <Link
                to="/w/$slug/p/$key"
                params={{ slug, key: p.key }}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm transition-colors hover:bg-muted"
              >
                <span className="w-14 font-mono text-xs text-muted-foreground">{p.key}</span>
                <span className="flex-1 font-medium">{p.name}</span>
                {p.archivedAt !== null ? (
                  <Badge variant="outline">Archived</Badge>
                ) : (
                  <span className="text-right text-xs text-muted-foreground">
                    {meetingOpen(p.id) ? (
                      <Badge variant="secondary" className="mr-2">Meeting in progress</Badge>
                    ) : (
                      openTopics(p.id) > 0 && <span className="mr-2 hidden sm:inline">{openTopics(p.id)} to discuss ·</span>
                    )}
                    {openCount(p.id)} open
                  </span>
                )}
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <SectionHeader title="Create a Project" description="Choose a short, permanent key for Task identifiers, such as WEB-12." />
      <form onSubmit={create} className="flex flex-wrap gap-2">
        <Input value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="KEY" maxLength={6} aria-label="Project key" className="h-9 w-24 font-mono" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New Project name" aria-label="Project name" className="h-9 min-w-40 flex-1" />
        <Button type="submit" className="h-9" disabled={!key || !name}>Create Project</Button>
      </form>

      <Label className="flex items-center gap-2 font-normal text-muted-foreground">
        <Checkbox checked={showArchived} onCheckedChange={(v) => setShowArchived(v === true)} />
        Show archived Projects
      </Label>
      <section className="space-y-3 border-t pt-5">
        <SectionHeader title="Workspace data" description="Download all Project data, including retained deleted records, as JSON. GitHub tokens are excluded." />
        <Button variant="outline" asChild><a href={`/api/w/${encodeURIComponent(slug)}/export`} download>Export Workspace</a></Button>
        <p className="text-xs text-muted-foreground">You can install PM from your browser’s app menu or Add to Home Screen. An internet connection is required.</p>
      </section>
    </div>
  );
}
