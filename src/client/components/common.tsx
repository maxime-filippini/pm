import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import type { TaskStatus } from "../../shared/entities";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
  canceled: "Canceled",
};

export function StatusDot({ status }: { status: TaskStatus }) {
  const color = {
    todo: "border-muted-foreground",
    in_progress: "border-amber-400 bg-amber-400/30",
    done: "border-emerald-400 bg-emerald-400",
    canceled: "border-muted bg-muted",
  }[status];
  return <span className={cn("inline-block size-3 shrink-0 rounded-full border-2", color)} title={STATUS_LABEL[status]} />;
}

export function MemberAvatar({ name, className }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Avatar className={cn("size-6", className)} title={name}>
      <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
    </Avatar>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

/** Small uppercase heading above a list section, with an optional count. */
export function SectionHeading({ children, count }: { children: ReactNode; count?: number }) {
  return (
    <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children} {count !== undefined && <span className="font-normal">{count}</span>}
    </h2>
  );
}

export function ShowClosedToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Label className="flex items-center gap-2 font-normal text-muted-foreground">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} />
      Show done and canceled
    </Label>
  );
}

const TASK_KEY = /\b([A-Z]{2,6})-(\d+)\b/g;

/** Plain text that keeps line breaks and turns Task keys (WEB-12) into links. */
export function LinkifiedText({ slug, text, className }: { slug: string; text: string; className?: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(TASK_KEY)) {
    const [whole, key, number] = match;
    parts.push(text.slice(last, match.index));
    parts.push(
      <Link key={match.index} to="/w/$slug/p/$key/t/$number" params={{ slug, key: key!, number: number! }} className="font-mono text-[0.95em] underline underline-offset-2 hover:text-foreground">
        {whole}
      </Link>,
    );
    last = match.index + whole.length;
  }
  parts.push(text.slice(last));
  return <p className={cn("whitespace-pre-wrap", className)}>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</p>;
}
