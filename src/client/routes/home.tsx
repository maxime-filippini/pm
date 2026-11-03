import { PageHeader, SectionHeader } from "@/components/PageHeader";
import { Link, Navigate } from "@tanstack/react-router";
import { useMe } from "../api";
import { Empty } from "@/components/common";
import { getLastProject } from "../last-project";

export function HomePage() {
  const { me, error } = useMe();
  if (error) return <p className="text-destructive">{error}</p>;
  if (!me) return <Empty>Loading…</Empty>;
  if (me.workspaces.length === 1 && !me.isAdmin) {
    const slug = me.workspaces[0]!.slug;
    // Reopen the Project you last worked in.
    const key = getLastProject(slug);
    return key ? <Navigate to="/w/$slug/p/$key" params={{ slug, key }} replace /> : <Navigate to="/w/$slug" params={{ slug }} replace />;
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Your Workspaces" description="Open a Workspace to see the Projects you share with its Members." />
      <SectionHeader title="Workspaces" />
      {me.workspaces.length === 0 ? (
        <Empty>You have not been invited to a Workspace yet.</Empty>
      ) : (
        <ul className="flex flex-col gap-1.5">
            {me.workspaces.map((w) => (
              <li key={w.id}>
                <WorkspaceLink slug={w.slug} name={w.name} />
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

/** Explicit Workspace choices open Workspace view; automatic reopening happens above. */
function WorkspaceLink({ slug, name }: { slug: string; name: string }) {
  const className = "block rounded-md px-3 py-3 text-sm font-medium transition-colors hover:bg-muted/40";
  return (
    <Link to="/w/$slug" params={{ slug }} className={className}>{name}</Link>
  );
}
