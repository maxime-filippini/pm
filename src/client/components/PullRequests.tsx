import { useEffect, useMemo, useState } from "react";
import { uuidv7 } from "../../shared/ids";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { SectionHeader } from "./PageHeader";
import type { PullRequestLink } from "../../shared/entities";
export const PR_ERROR: Record<NonNullable<PullRequestLink["fetchError"]>, string> = {
  no_token: "Add a GitHub token in Project settings to fetch Pull Request states.",
  unauthorized: "GitHub token expired or lacks access",
  not_found: "Pull Request not found or not accessible",
  unavailable: "GitHub is unavailable. Try refreshing later.",
};
export function PullRequests({ taskId }: { taskId: string }) {
  const socket = useSocket();
  const all = useWorkspace((s) => s.view.pullRequestLinks), task = useWorkspace((s) => s.view.tasks[taskId]);
  const epoch = useWorkspace((s) => s.connectionEpoch), status = useWorkspace((s) => s.status);
  const pending = useWorkspace((s) => s.pending.some((p) => (p.command.name === "pr.refresh" || p.command.name === "pr.link") && p.command.args.taskId === taskId));
  const links = useMemo(() => Object.values(all).filter((p) => p.taskId === taskId).sort((a, b) => a.createdAt - b.createdAt), [all, taskId]);
  const [url, setUrl] = useState("");
  useEffect(() => { if (status === "online") socket.send("pr.refresh", { taskId }); }, [socket, taskId, epoch, status]);
  const merged = links.length > 0 && links.every((p) => p.state === "merged" && p.fetchError === null);
  return <section className="space-y-4 border-l border-border/60 pl-5">
    <SectionHeader title="Pull Requests" description="Link GitHub work to this Task. States refresh when you open the Task; completion stays your choice." />
    <ul className="space-y-3">{links.map((link) => <li key={link.id} className="space-y-2 py-2 text-sm">
      <div className="flex flex-wrap items-start gap-2"><a href={link.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 break-words underline">{link.title ?? `${link.owner}/${link.repo} #${link.number}`}</a><Badge variant="secondary">{link.fetchError ? "Needs attention" : link.state ?? "Fetching…"}</Badge></div>
      <p className="break-all text-xs text-muted-foreground">{link.owner}/{link.repo} #{link.number}{link.fetchedAt && ` · Checked ${new Date(link.fetchedAt).toLocaleString()}`}</p>
      {link.fetchError && <p className="text-sm text-amber-400">{PR_ERROR[link.fetchError]}</p>}
      <Button variant="ghost" size="sm" onClick={() => socket.send("pr.unlink", { id: link.id })}>Unlink</Button>
    </li>)}</ul>
    {!links.length && <p className="text-sm text-muted-foreground">No Pull Requests linked yet.</p>}
    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (socket.send("pr.link", { id: uuidv7(), taskId, url })) setUrl(""); }}>
      <Input aria-label="Pull Request URL" type="url" className="min-w-0 flex-1 basis-56" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/123" />
      <Button disabled={!url.trim() || pending}>Link PR</Button>
      {links.length > 0 && <Button type="button" variant="outline" disabled={pending} onClick={() => socket.send("pr.refresh", { taskId })}>{pending ? "Refreshing…" : "Refresh states"}</Button>}
    </form>
    {merged && task?.status !== "done" && <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-3 text-sm"><span>PR merged — mark Done?</span><Button size="sm" onClick={() => socket.send("task.setStatus", { id: taskId, status: "done" })}>Mark Done</Button></div>}
  </section>;
}
