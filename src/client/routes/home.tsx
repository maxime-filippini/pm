import { Link, Navigate } from "@tanstack/react-router";
import { useMe } from "../api";
import { Card, Empty } from "../components/ui";

export function HomePage() {
  const { me, error } = useMe();
  if (error) return <p className="text-red-400">{error}</p>;
  if (!me) return <Empty>Loading…</Empty>;
  if (me.workspaces.length === 1 && !me.isAdmin) {
    return <Navigate to="/w/$slug" params={{ slug: me.workspaces[0]!.slug }} />;
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
                <Link to="/w/$slug" params={{ slug: w.slug }} className="block px-4 py-3 hover:bg-neutral-800/50">
                  {w.name}
                </Link>
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
