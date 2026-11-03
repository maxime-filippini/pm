import { Link, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { uuidv7 } from "../../shared/ids";
import { Button, Card, Empty, Input } from "../components/ui";
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
      <Card>
        {list.length === 0 ? (
          <Empty>No Projects yet.</Empty>
        ) : (
          <ul className="divide-y divide-neutral-800">
            {list.map((p) => (
              <li key={p.id}>
                <Link to="/w/$slug/p/$key" params={{ slug, key: p.key }} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-800/50">
                  <span className="w-14 font-mono text-xs text-neutral-500">{p.key}</span>
                  <span className="flex-1">{p.name}</span>
                  {p.archivedAt !== null ? (
                    <span className="text-xs text-neutral-500">Archived</span>
                  ) : (
                    <span className="text-xs text-neutral-500">{openCount(p.id)} open</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <form onSubmit={create} className="flex flex-wrap gap-2">
        <Input value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="KEY" maxLength={6} className="w-24 font-mono" />
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New Project name" className="min-w-40 flex-1" />
        <Button type="submit" variant="primary" disabled={!key || !name}>Create Project</Button>
      </form>

      <label className="flex items-center gap-2 text-sm text-neutral-400">
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        Show archived Projects
      </label>
    </div>
  );
}
