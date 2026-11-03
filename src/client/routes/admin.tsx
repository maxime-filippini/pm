import { useEffect, useState } from "react";
import { api, useMe } from "../api";
import { toast } from "sonner";
import { Empty } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type AdminWorkspace = {
  id: string;
  slug: string;
  name: string;
  members: Array<{ id: string; email: string; name: string; addedAt: number }>;
};

export function AdminPage() {
  const { me } = useMe();
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[] | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");

  const load = () => api<{ workspaces: AdminWorkspace[] }>("/api/admin/workspaces").then((r) => setWorkspaces(r.workspaces), (e: Error) => toast.error(e.message));
  useEffect(() => {
    void load();
  }, []);

  if (me && !me.isAdmin) return <Empty>Admins only.</Empty>;
  if (!workspaces) return <Empty>Loading…</Empty>;

  const run = (p: Promise<unknown>) => p.then(load, (e: Error) => toast.error(e.message));

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-xl font-semibold">Admin</h1>

      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(api("/api/admin/workspaces", { method: "POST", body: JSON.stringify({ slug, name }) }).then(() => {
            setSlug("");
            setName("");
          }));
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workspace name" className="h-9 min-w-40 flex-1" />
        <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="slug" className="h-9 w-32 font-mono" />
        <Button type="submit" className="h-9" disabled={!slug || !name}>Create Workspace</Button>
      </form>

      {workspaces.length === 0 && <Empty>No Workspaces yet.</Empty>}
      {workspaces.map((w) => <WorkspaceCard key={w.id} workspace={w} run={run} />)}
    </div>
  );
}

function WorkspaceCard({ workspace: w, run }: { workspace: AdminWorkspace; run: (p: Promise<unknown>) => Promise<unknown> }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  return (
    <Card className="gap-3 px-4">
      <h2 className="font-semibold">
        {w.name} <span className="font-mono text-xs font-normal text-muted-foreground">/w/{w.slug}</span>
      </h2>
      <ul className="divide-y divide-border text-sm">
        {w.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2">
            <span className="flex-1">{m.name} <span className="text-muted-foreground">{m.email}</span></span>
            <Button
              variant="ghost" size="sm"
              onClick={() => {
                const next = prompt("Rename Member", m.name);
                if (next && next !== m.name) void run(api(`/api/admin/members/${m.id}`, { method: "PATCH", body: JSON.stringify({ name: next }) }));
              }}
            >
              Rename
            </Button>
            <Button
              variant="ghost" size="sm"
              onClick={() => {
                if (confirm(`Remove ${m.name} from ${w.name}?`)) void run(api(`/api/admin/workspaces/${w.id}/members/${m.id}`, { method: "DELETE" }));
              }}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(api(`/api/admin/workspaces/${w.id}/members`, { method: "POST", body: JSON.stringify({ email, name }) }).then(() => {
            setEmail("");
            setName("");
          }));
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="h-9 w-40" />
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="h-9 min-w-48 flex-1" />
        <Button type="submit" variant="outline" className="h-9" disabled={!email || !name}>Add Member</Button>
      </form>
    </Card>
  );
}
