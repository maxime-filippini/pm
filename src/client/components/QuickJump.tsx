import { Dialog } from "radix-ui";
import { SearchIcon, XIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import type { SearchResult } from "../../shared/entities";
import { useSocket } from "../sync/context";
import { useWorkspace } from "../store/workspace";
import { searchDestination } from "../lib/search";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function QuickJump({ navigation = false, projectKey, projectId }: { navigation?: boolean; projectKey?: string; projectId?: string }) {
  const socket = useSocket(), navigate = useNavigate(), { slug } = useParams({ strict: false });
  const epoch = useWorkspace((s) => s.connectionEpoch), status = useWorkspace((s) => s.status);
  const [open, setOpen] = useState(false), [text, setText] = useState(""), [items, setItems] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const listId = useId(), input = useRef<HTMLInputElement>(null);
  const label = projectKey ? "Search Project" : "Search Workspace";
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((v) => !v); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setSelected(0); setError(""); setItems([]);
    if (!open || !text.trim() || (projectKey && !projectId)) { setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      socket.query<{ items: SearchResult[] }>("search", { text, ...(projectKey && { projectId }) }).then((page) => {
        if (!cancelled) { setItems(page.items); setLoading(false); }
      }, (e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [socket, open, text, epoch, status, retry, projectKey, projectId]);
  useEffect(() => { document.getElementById(listId + "-" + selected)?.scrollIntoView({ block: "nearest" }); }, [listId, selected]);
  const choose = (item: SearchResult) => {
    if (!slug) return;
    const path = searchDestination(slug, item, useWorkspace.getState().view.meetings);
    const [to, hash] = path.split("#");
    setOpen(false); void navigate({ to: to!, hash: hash ?? "" });
  };
  return <Dialog.Root open={open} onOpenChange={(value) => { setOpen(value); if (value) setText(""); }}>
    <Dialog.Trigger asChild><Button variant="ghost" size="icon" className={navigation ? "size-10 lg:h-10 lg:w-full lg:justify-start lg:gap-3 lg:px-3" : undefined} aria-label={label} title={`${label} (⌘K / Ctrl+K)`}><SearchIcon />{navigation && <span className="hidden lg:inline">{label}</span>}</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="fixed inset-0 z-40 bg-black/60" />
      <Dialog.Content className="fixed top-[10%] left-1/2 z-50 max-h-[80vh] w-[calc(100%_-_1.5rem)] max-w-xl -translate-x-1/2 overflow-y-auto rounded-xl border bg-background p-4 shadow-xl" onOpenAutoFocus={(e) => { e.preventDefault(); input.current?.focus(); }}>
        <div className="flex items-start justify-between gap-3"><div><Dialog.Title className="font-heading text-lg font-semibold">{label}</Dialog.Title><Dialog.Description className="mb-4 text-sm text-muted-foreground">{projectKey ? `Search Tasks, Features and Topics in ${projectKey}.` : "Search Tasks, Features and Topics across every active Project."}</Dialog.Description></div><Dialog.Close asChild><Button variant="ghost" size="icon" aria-label="Close search"><XIcon /></Button></Dialog.Close></div>
        <Input ref={input} role="combobox" aria-label={label} aria-expanded={true} aria-controls={listId} aria-activedescendant={items[selected] ? listId + "-" + selected : undefined} autoComplete="off" value={text} maxLength={200} placeholder="Task key or title…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setSelected((n) => Math.max(0, Math.min(n + 1, items.length - 1))); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSelected((n) => Math.max(0, n - 1)); }
          if (e.key === "Enter" && items[selected]) { e.preventDefault(); choose(items[selected]!); }
        }} />
        <div role="status" className="py-3 text-sm text-muted-foreground">{loading ? "Searching…" : !text.trim() ? "Try a Task key such as WEB-12, or a few words from a title." : !error && !items.length ? "No matching work found." : ""}</div>
        {error && <p role="alert">{error} <Button size="sm" variant="outline" onClick={() => setRetry((n) => n + 1)}>Retry</Button></p>}
        <ul id={listId} role="listbox" aria-label="Search results" className="space-y-1">{items.map((item, index) => <li key={item.type + item.id} id={listId + "-" + index} role="option" aria-selected={selected === index} onMouseMove={() => setSelected(index)}>
          <button type="button" className={"w-full rounded-lg p-3 text-left text-sm " + (selected === index ? "bg-muted" : "")} onClick={() => choose(item)}>
            <span className="block break-words font-medium">{item.title}</span><span className="text-xs text-muted-foreground">{item.projectKey}{item.taskNumber ? "-" + item.taskNumber : ""} · {item.type}</span>
          </button>
        </li>)}</ul>
        <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">↑ ↓ to select · Enter to open · Escape to close</p>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
