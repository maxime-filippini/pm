import { Link, Outlet, useMatchRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { cx } from "../components/ui";
import { useWorkspace } from "../store/workspace";
import { WorkspaceProvider } from "../sync/context";

export function WorkspaceLayout() {
  const { slug } = useParams({ from: "/w/$slug" });
  // Set when the current route is inside a Project (/w/$slug/p/$key/...).
  const { key } = useParams({ strict: false });
  return (
    <WorkspaceProvider slug={slug}>
      <nav className="sticky top-0 z-10 -mx-3 mb-5 flex items-center gap-1 border-b border-neutral-800 bg-neutral-950/95 px-3 py-2 text-sm backdrop-blur sm:-mx-4 sm:px-4">
        <Link to="/" className="mr-1 shrink-0 px-1 font-semibold" title="All Workspaces">PM</Link>
        {key ? <ProjectNav slug={slug} projectKey={key} /> : <WorkspaceNav slug={slug} />}
        <span className="flex-1" />
        <ConnectionBadge />
      </nav>
      <Gate>
        <Outlet />
      </Gate>
    </WorkspaceProvider>
  );
}

const tab = "shrink-0 rounded-md px-3 py-2 text-neutral-400 hover:text-neutral-100 sm:py-1.5";
const activeTab = "bg-neutral-800 text-neutral-100";

function WorkspaceNav({ slug }: { slug: string }) {
  return (
    <>
      <Link to="/w/$slug" params={{ slug }} activeOptions={{ exact: true }} className={tab} activeProps={{ className: activeTab }}>Projects</Link>
      <Link to="/w/$slug/me" params={{ slug }} className={tab} activeProps={{ className: activeTab }}>My Tasks</Link>
    </>
  );
}

/** Inside a Project the nav stays in it: switching tabs or Projects never drops you back to the Project list. */
function ProjectNav({ slug, projectKey }: { slug: string; projectKey: string }) {
  const matchRoute = useMatchRoute();
  const params = { slug, key: projectKey };
  const onMyTasks = Boolean(matchRoute({ to: "/w/$slug/p/$key/me", params }));
  // On a Task neither tab is lit: you may have come from either list, and Back returns there.
  const onTasks = Boolean(matchRoute({ to: "/w/$slug/p/$key", params }));
  return (
    <>
      <ProjectSwitcher slug={slug} projectKey={projectKey} keepMyTasks={onMyTasks} />
      <Link to="/w/$slug/p/$key" params={{ slug, key: projectKey }} className={cx(tab, onTasks && activeTab)}>Tasks</Link>
      <Link to="/w/$slug/p/$key/me" params={{ slug, key: projectKey }} className={cx(tab, onMyTasks && activeTab)}>My Tasks</Link>
    </>
  );
}

const ALL_PROJECTS = "__all";
const ALL_MY_TASKS = "__me";

function ProjectSwitcher({ slug, projectKey, keepMyTasks }: { slug: string; projectKey: string; keepMyTasks: boolean }) {
  const navigate = useNavigate();
  const projects = useWorkspace((s) => s.view.projects);
  const options = useMemo(
    () => Object.values(projects).filter((p) => p.archivedAt === null || p.key === projectKey).sort((a, b) => a.name.localeCompare(b.name)),
    [projects, projectKey],
  );
  const current = options.find((p) => p.key === projectKey);

  const go = (value: string) => {
    if (value === ALL_PROJECTS) navigate({ to: "/w/$slug", params: { slug } });
    else if (value === ALL_MY_TASKS) navigate({ to: "/w/$slug/me", params: { slug } });
    else if (keepMyTasks) navigate({ to: "/w/$slug/p/$key/me", params: { slug, key: value } });
    else navigate({ to: "/w/$slug/p/$key", params: { slug, key: value } });
  };

  return (
    <label className="relative mr-1 flex min-w-0 shrink items-center gap-1 rounded-md px-2 py-2 font-medium hover:bg-neutral-800 sm:py-1.5">
      <span className="font-mono text-xs text-neutral-500">{projectKey}</span>
      <span className="max-w-[9rem] truncate sm:max-w-[16rem]">{current?.name ?? projectKey}</span>
      <span aria-hidden className="text-neutral-500">▾</span>
      {/* Native select: invisible over the label, so phones get the system picker. */}
      <select aria-label="Switch Project" value={projectKey} onChange={(e) => go(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
        {options.map((p) => <option key={p.id} value={p.key}>{p.key} · {p.name}</option>)}
        <option disabled>──────────</option>
        <option value={ALL_PROJECTS}>All Projects</option>
        <option value={ALL_MY_TASKS}>My Tasks in every Project</option>
      </select>
    </label>
  );
}

function ConnectionBadge() {
  const status = useWorkspace((s) => s.status);
  const pending = useWorkspace((s) => s.pending.length);
  if (status === "online") return pending > 0 ? <span className="shrink-0 text-xs text-neutral-500">Saving…</span> : null;
  const label = { connecting: "Connecting…", offline: "Reconnecting…", removed: "Removed from Workspace" }[status];
  return <span className="shrink-0 text-xs text-amber-400">{label}</span>;
}

function Gate({ children }: { children: React.ReactNode }) {
  const ready = useWorkspace((s) => s.memberId !== null);
  const status = useWorkspace((s) => s.status);
  if (status === "removed") return <p className="text-neutral-400">You no longer have access to this Workspace.</p>;
  if (!ready) return <p className="py-8 text-center text-sm text-neutral-500">Loading…</p>;
  return <>{children}</>;
}
