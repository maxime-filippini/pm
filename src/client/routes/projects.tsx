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
  const [showArchived, setShowArchived] = useState(false);
  const [key, setKey] = useState("");
  const [name, setName] = useState("");

  const list = useMemo(
    () => Object.values(projects).filter((p) => showArchived || p.archivedAt === null).sort((a, b) => a.name.localeCompare(b.name)),
    [projects, showArchived],
  );
  const openCount = (projectId: string) =>
    Object.values(tasks).filter((t) => t.projectId === projectId && (t.status === "todo" || t.status === "in_progress")).length;

  const create = (e: React.FormEvent) => {
    e.preventDefault();
    if (socket.send("project.create", { id: uuidv7(), key: key.trim().toUpperCase(), name })) {
      setKey("");
      setName("");
    }
  };

  return (
    <div className="space-y-6">
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
                  <span className="text-xs text-muted-foreground">{openCount(p.id)} open</span>
                )}
                <ChevronRightIcon className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={create} className="flex flex-wrap gap-2">
        <Input value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="KEY" maxLength={6} aria-label="Project key" className="h-9 w-24 font-mono" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New Project name" aria-label="Project name" className="h-9 min-w-40 flex-1" />
        <Button type="submit" className="h-9" disabled={!key || !name}>Create Project</Button>
      </form>

      <Label className="flex items-center gap-2 font-normal text-muted-foreground">
        <Checkbox checked={showArchived} onCheckedChange={(v) => setShowArchived(v === true)} />
        Show archived Projects
      </Label>
    </div>
  );
}
