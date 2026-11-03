import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import type { TaskStatus } from "../../shared/entities";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export function Button({ variant = "default", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" }) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50",
        variant === "primary" && "bg-indigo-500 text-white hover:bg-indigo-400",
        variant === "default" && "border border-neutral-700 bg-neutral-900 hover:bg-neutral-800",
        variant === "ghost" && "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100",
        className,
      )}
    />
  );
}

const field = "rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm outline-none focus:border-indigo-400";

// Full width unless the caller sets a width (Tailwind can't resolve two width classes by order).
const width = (className?: string) => (/(^|\s)(w-|min-w-|flex-1)/.test(className ?? "") ? null : "w-full");

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(field, width(className), className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(field, "min-h-32 w-full", className)} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(field, "w-auto", className)} />;

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-lg border border-neutral-800 bg-neutral-900/50", className)}>{children}</div>;
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
  canceled: "Canceled",
};

export function StatusDot({ status }: { status: TaskStatus }) {
  const color = { todo: "border-neutral-400", in_progress: "border-amber-400 bg-amber-400/30", done: "border-emerald-400 bg-emerald-400", canceled: "border-neutral-600 bg-neutral-600" }[status];
  return <span className={cx("inline-block size-3 shrink-0 rounded-full border-2", color)} title={STATUS_LABEL[status]} />;
}

export function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-[10px] font-semibold" title={name}>{initials}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-8 text-center text-sm text-neutral-500">{children}</p>;
}
