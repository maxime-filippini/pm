import { useEffect, useState } from "react";
import { fetchMe, type Me } from "../api";

export function HomePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMe().then(setMe, (e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-400">{error}</p>;
  if (!me) return <p className="text-neutral-400">Loading…</p>;

  return (
    <div className="space-y-4">
      <p className="text-neutral-400">Signed in as {me.email}</p>
      {!me.member && <p>You have not been invited to a Workspace yet.</p>}
      <ul className="space-y-2">
        {me.workspaces.map((w) => (
          <li key={w.id} className="rounded-lg border border-neutral-800 p-3">
            {w.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
