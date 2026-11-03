import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { PageHeader, SectionHeader } from "@/components/PageHeader";
import { EditableText } from "@/components/EditableText";
import { Viewing } from "@/components/Presence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";

export function ProjectSettingsPage() {
  const { key } = useParams({ from: "/w/$slug/p/$key/settings" }), socket = useSocket();
  const project = useWorkspace((s) => Object.values(s.view.projects).find((p) => p.key === key));
  const pending = useWorkspace((s) => s.pending.some((p) => p.command.name === "project.setGithubToken" && p.command.args.id === project?.id));
  const [token, setToken] = useState("");
  if (!project) return null;
  return <Viewing target={{ type: "project", id: project.id }}><div className="space-y-6">
    <PageHeader title="Project settings" description="Manage the Project name, visibility and GitHub access. These settings apply to everyone in the Workspace." />
    <section className="space-y-3 rounded-xl border p-4">
      <SectionHeader title="Project identity" description={`Task keys begin with ${project.key}. The key is permanent; the name can change.`} />
      <label htmlFor="project-name" className="block text-sm">Project name</label>
      <EditableText field="name" value={project.name} onSave={(name) => socket.send("project.rename", { id: project.id, name })} render={(props) => <Input {...props} id="project-name" aria-label="Project name" maxLength={100} />} />
    </section>
    <section className="space-y-3 rounded-xl border p-4">
      <SectionHeader title="GitHub access" description="A token lets PM read the states of Pull Requests you link to Tasks. It never changes anything on GitHub." />
      <p className="text-sm">{pending ? "Saving GitHub access…" : project.hasGithubToken ? "A GitHub token is configured." : "No GitHub token configured."}</p>
      <p className="text-sm text-muted-foreground">Use a fine-grained personal access token scoped to this Project’s repositories, with <strong>Pull requests: read</strong> and <strong>Metadata: read</strong>. One token covers a single GitHub owner.</p>
      <form className="space-y-2" onSubmit={(e) => {
        e.preventDefault();
        if (socket.send("project.setGithubToken", { id: project.id, token })) setToken("");
      }}>
        <label htmlFor="github-token" className="text-sm">New GitHub token</label>
        <Input id="github-token" type="password" autoComplete="new-password" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="Enter a new token" maxLength={10_000} />
        <p className="text-xs text-muted-foreground">Tokens are encrypted and write-only. Existing tokens are never displayed or exported.</p>
        <div className="flex flex-wrap gap-2"><Button disabled={!token.trim() || pending}>Save token</Button>{project.hasGithubToken && <Button type="button" variant="outline" disabled={pending} onClick={() => socket.send("project.setGithubToken", { id: project.id, token: null })}>Remove token</Button>}</div>
      </form>
    </section>
    <section className="space-y-3 rounded-xl border p-4">
      <SectionHeader title="Project visibility" description="Archived Projects leave navigation and search, while all their data remains available." />
      <Button variant="outline" onClick={() => socket.send(project.archivedAt === null ? "project.archive" : "project.unarchive", { id: project.id })}>{project.archivedAt === null ? "Archive Project" : "Unarchive Project"}</Button>
    </section>
  </div></Viewing>;
}
