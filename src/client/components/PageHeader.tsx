import type { ReactNode } from "react";

export function PageHeader({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <header className="space-y-2">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-heading text-2xl font-semibold tracking-tight">{title}</h1>{children}</div>
    <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{description}</p>
  </header>;
}
export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return <header className="space-y-1"><h2 className="font-heading text-base font-semibold">{title}</h2>{description && <p className="text-sm text-muted-foreground">{description}</p>}</header>;
}
