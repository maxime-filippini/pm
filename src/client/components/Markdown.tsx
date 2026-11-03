import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { useParams, Link } from "@tanstack/react-router";
import { useMemo, useId, type ComponentProps } from "react";
import { taskLinks, type TaskResolver } from "../lib/markdown";
import { useWorkspace } from "../store/workspace";
import { Textarea } from "./ui/textarea";

export function MarkdownRenderer({ text, resolveTask }: { text: string; resolveTask: TaskResolver }) {
  const plugin = useMemo(() => taskLinks(resolveTask), [resolveTask]);
  return <div className="markdown min-w-0 break-words text-sm leading-relaxed">
    <ReactMarkdown skipHtml remarkPlugins={[remarkBreaks, plugin]} components={{
      a: ({ href, children }) => {
        if (!href) return <span>{children}</span>;
        if (href.startsWith("/w/")) return <Link to={href}>{children}</Link>;
        return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
      },
    }}>{text}</ReactMarkdown>
  </div>;
}
export function Markdown({ text }: { text: string }) {
  const { slug } = useParams({ strict: false });
  const tasks = useWorkspace((s) => s.view.tasks), projects = useWorkspace((s) => s.view.projects);
  const resolveTask = useMemo<TaskResolver>(() => {
    const urls = new Map<string, string>();
    for (const task of Object.values(tasks)) {
      const project = projects[task.projectId];
      if (slug && project) urls.set(project.key + "-" + task.number, `/w/${encodeURIComponent(slug)}/p/${project.key}/t/${task.number}`);
    }
    return (key) => urls.get(key) ?? null;
  }, [tasks, projects, slug]);
  return <MarkdownRenderer text={text} resolveTask={resolveTask} />;
}
/** Controlled Markdown textarea and live preview. Caller owns save/autosave behavior. */
export function MarkdownInput(props: ComponentProps<typeof Textarea>) {
  const id = useId();
  return <div className="min-w-0 space-y-3">
    <Textarea {...props} aria-describedby={id} />
    <p id={id} className="text-xs text-muted-foreground">Markdown supported. Task keys such as WEB-12 link to existing Tasks.</p>
    <div className="min-w-0 border-l border-border/60 pl-4">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Live preview</p>
      {props.value ? <Markdown text={String(props.value)} /> : <p className="text-sm text-muted-foreground">Your formatted text will appear here.</p>}
    </div>
  </div>;
}
