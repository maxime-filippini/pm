import { Link, Navigate } from "@tanstack/react-router";
import { useMe } from "../api";
import { Card, Empty } from "../components/ui";
import { getLastProject } from "../last-project";

export function HomePage() {
  const { me, error } = useMe();
  if (error) return <p className="text-red-400">{error}</p>;
  if (!me) return <Empty>Loading…</Empty>;
  if (me.workspaces.length === 1 && !me.isAdmin) {
    const slug = me.workspaces[0]!.slug;
    // Reopen the Project you last worked in.
    const key = getLastProject(slug);
    return key ? <Navigate to="/w/$slug/p/$key" params={{ slug, key }} replace /> : <Navigate to="/w/$slug" params={{ slug }} replace />;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-400">Signed in as {me.email}</p>
      {me.workspaces.length === 0 ? (
        <Empty>You have not been invited to a Workspace yet.</Empty>
      ) : (
        <Card>
          <ul className="divide-y divide-neutral-800">
            {me.workspaces.map((w) => (
              <li key={w.id}>
                <WorkspaceLink slug={w.slug} name={w.name} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {me.isAdmin && (
        <Link to="/admin" className="inline-block text-sm text-indigo-400 hover:underline">
          Admin: Workspaces and Members →
        </Link>
      )}
    </div>
  );
}

/** Opens the Project you last worked in, or the Project list the first time. */
function WorkspaceLink({ slug, name }: { slug: string; name: string }) {
  const key = getLastProject(slug);
  const className = "block px-4 py-3 hover:bg-neutral-800/50";
  return key ? (
    <Link to="/w/$slug/p/$key" params={{ slug, key }} className={className}>{name}</Link>
  ) : (
    <Link to="/w/$slug" params={{ slug }} className={className}>{name}</Link>
  );
}
