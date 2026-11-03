import { Link, Outlet, useParams } from "@tanstack/react-router";
import { useWorkspace } from "../store/workspace";
import { WorkspaceProvider } from "../sync/context";

export function WorkspaceLayout() {
  const { slug } = useParams({ from: "/w/$slug" });
  return (
    <WorkspaceProvider slug={slug}>
      <nav className="mb-6 flex items-center gap-1 border-b border-neutral-800 pb-3 text-sm">
        <NavLink to="/w/$slug" slug={slug} exact>Projects</NavLink>
        <NavLink to="/w/$slug/me" slug={slug}>My Tasks</NavLink>
        <span className="flex-1" />
        <ConnectionBadge />
      </nav>
      <Gate>
        <Outlet />
      </Gate>
    </WorkspaceProvider>
  );
}

function NavLink({ to, slug, exact, children }: { to: "/w/$slug" | "/w/$slug/me"; slug: string; exact?: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      params={{ slug }}
      activeOptions={{ exact }}
      className="rounded-md px-3 py-1.5 text-neutral-400 hover:text-neutral-100"
      activeProps={{ className: "bg-neutral-800 text-neutral-100" }}
    >
      {children}
    </Link>
  );
}

function ConnectionBadge() {
  const status = useWorkspace((s) => s.status);
  const pending = useWorkspace((s) => s.pending.length);
  if (status === "online") return pending > 0 ? <span className="text-xs text-neutral-500">Saving…</span> : null;
  const label = { connecting: "Connecting…", offline: "Reconnecting…", removed: "Removed from Workspace" }[status];
  return <span className="text-xs text-amber-400">{label}</span>;
}

function Gate({ children }: { children: React.ReactNode }) {
  const ready = useWorkspace((s) => s.memberId !== null);
  const status = useWorkspace((s) => s.status);
  if (status === "removed") return <p className="text-neutral-400">You no longer have access to this Workspace.</p>;
  if (!ready) return <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>;
  return <>{children}</>;
}
