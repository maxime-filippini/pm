import { SectionHeader } from "./PageHeader";
import { ConcurrentDraft } from "./ConcurrentDraft";
import { useEffect, useState } from "react";
import type { Comment, CommentTarget } from "../../shared/entities";
import type { CommentsPage } from "../../shared/protocol";
import { uuidv7 } from "../../shared/ids";
import { commentKey } from "../store/comments";
import { useWorkspace, workspaceActions } from "../store/workspace";
import { useSocket } from "../sync/context";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Markdown, MarkdownInput } from "./Markdown";

const EMPTY: Comment[] = [];
export function Comments({ target }: { target: CommentTarget }) {
  const socket = useSocket();
  const key = commentKey(target);
  const items = useWorkspace((s) => s.comments[key] ?? EMPTY);
  const collection = useWorkspace((s) => s.commentCollections[key]);
  const epoch = useWorkspace((s) => s.connectionEpoch);
  const status = useWorkspace((s) => s.status);
  const members = useWorkspace((s) => s.view.members);
  const memberId = useWorkspace((s) => s.memberId);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    workspaceActions.loadComments(target);
    return () => workspaceActions.unloadComments(target);
  }, [key]); // target identity is its type + id

  async function load(cursor?: CommentsPage["nextCursor"]) {
    const state = useWorkspace.getState();
    const generation = state.commentCollections[key]?.generation;
    if (!generation) return;
    setLoading(true);
    setError("");
    try {
      const page = await socket.query<CommentsPage>("comments.list", { target, ...(cursor && { cursor }) });
      workspaceActions.commentsPage(target, page, state.version, state.connectionEpoch, generation);
    } catch (e) {
      if (useWorkspace.getState().connectionEpoch === state.connectionEpoch) setError(e instanceof Error ? e.message : "Could not load Comments");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (status === "online") void load();
  }, [key, epoch, status]);

  return <Card className="gap-3 px-4">
    <SectionHeader title="Comments" description="Discuss the work here. Everyone can post; you can edit or delete your own Comments." />
    {items.map((comment) => <CommentRow key={comment.id} comment={comment} author={members[comment.authorId]?.name ?? "Former Member"} own={memberId === comment.authorId} />)}
    {loading && <p role="status" className="text-sm text-muted-foreground">Loading Comments…</p>}
    {error && <div role="alert" className="text-sm">{error} <Button variant="outline" size="sm" onClick={() => void load(collection?.nextCursor)}>Retry</Button></div>}
    {collection?.loaded && !items.length && <p className="text-sm text-muted-foreground">No Comments yet.</p>}
    {collection?.nextCursor && <Button variant="outline" disabled={loading} onClick={() => void load(collection.nextCursor)}>Load more</Button>}
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      if (socket.send("comment.create", { id: uuidv7(), target, body })) setBody("");
    }}>
      <MarkdownInput aria-label="New Comment" placeholder="Add a Comment…" maxLength={20_000} value={body} onChange={(e) => setBody(e.target.value)} />
      <Button disabled={!body.trim()}>Post Comment</Button>
    </form>
  </Card>;
}
function CommentRow({ comment, author, own }: { comment: Comment; author: string; own: boolean }) {
  const socket = useSocket();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  return <article className="space-y-2 border-b pb-3">
    <p className="text-xs text-muted-foreground">{author}{comment.via && ` via ${comment.via}`} · {new Date(comment.createdAt).toLocaleString()}{comment.editedAt !== null && ` · Edited ${new Date(comment.editedAt).toLocaleString()}`}</p>
    {editing ? <ConcurrentDraft value={comment.body} draft={draft} field={"comment:" + comment.id} onUseTheirs={() => setDraft(comment.body)}><form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      if (socket.send("comment.edit", { id: comment.id, body: draft })) setEditing(false);
    }}>
      <MarkdownInput aria-label="Edit Comment" maxLength={20_000} value={draft} onChange={(e) => setDraft(e.target.value)} />
      <div className="flex gap-2"><Button size="sm" disabled={!draft.trim()}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button></div>
    </form></ConcurrentDraft> : <Markdown text={comment.body} />}
    {own && !editing && <div className="flex gap-2">
      <Button variant="ghost" size="sm" onClick={() => { setDraft(comment.body); setEditing(true); }}>Edit</Button>
      <Button variant="ghost" size="sm" onClick={() => socket.send("comment.delete", { id: comment.id })}>Delete</Button>
    </div>}
  </article>;
}
