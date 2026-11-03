import { QuickJump } from "@/components/QuickJump";
import { Link, Outlet, useMatchRoute, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeftIcon, CheckIcon, ChevronsUpDownIcon, FolderIcon } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../store/workspace";
import { WorkspaceProvider } from "../sync/context";

export function WorkspaceLayout() {
  const { slug } = useParams({ from: "/w/$slug" });
  // Set when the current route is inside a Project (/w/$slug/p/$key/...).
  const { key } = useParams({ strict: false });
  return (
    <WorkspaceProvider slug={slug}>
      <nav className="sticky top-0 z-10 -mx-3 mb-5 flex flex-wrap items-center gap-1 border-b bg-background/95 px-3 py-2 text-sm backdrop-blur sm:-mx-4 sm:px-4">
        <Link to="/" className="mr-1 shrink-0 px-1 font-heading font-semibold" title="All Workspaces">PM</Link>
        {key ? <ProjectNav slug={slug} projectKey={key} /> : <WorkspaceNav slug={slug} />}
        <span className="flex-1" />
        <Link to="/w/$slug/activity" params={{ slug }} className={tab} activeProps={{ className: activeTab }}>Activity</Link>
        <QuickJump />
        <ConnectionBadge />
      </nav>
      <Gate>
        <Outlet />
      </Gate>
    </WorkspaceProvider>
  );
}

const tab = "h-9 shrink-0 rounded-lg px-3 inline-flex items-center text-muted-foreground transition-colors hover:text-foreground sm:h-8";
const activeTab = "bg-muted text-foreground";

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
  const onSettings = Boolean(matchRoute({ to: "/w/$slug/p/$key/settings", params }));
  const onMyTasks = Boolean(matchRoute({ to: "/w/$slug/p/$key/me", params }));
  // On a Task neither tab is lit: you may have come from either list, and Back returns there.
  const onTasks = Boolean(matchRoute({ to: "/w/$slug/p/$key", params }));
  const onFeatures = Boolean(matchRoute({ to: "/w/$slug/p/$key/features", params, fuzzy: true }));
  const onMeetings = Boolean(matchRoute({ to: "/w/$slug/p/$key/meetings", params, fuzzy: true }));
  const meetingOpen = useWorkspace((s) => {
    const project = Object.values(s.view.projects).find((p) => p.key === projectKey);
    return Boolean(project && Object.values(s.view.meetings).some((m) => m.projectId === project.id && m.endedAt === null));
  });
  return (
    <>
      <Link to="/w/$slug" params={{ slug }} className={cn(tab, "gap-1.5 px-2")} title="Back to Workspace"><ArrowLeftIcon className="size-3.5" /> Workspace</Link>
      <ProjectSwitcher slug={slug} projectKey={projectKey} tab={onSettings ? "settings" : onMyTasks ? "me" : onFeatures ? "features" : onMeetings ? "meetings" : "tasks"} />
      {/* On phones the tabs get their own row under the Project switcher. */}
      <div className="order-last -mx-1 flex w-full gap-1 sm:order-none sm:mx-0 sm:w-auto overflow-x-auto">
        <Link to="/w/$slug/p/$key" params={params} className={cn(tab, onTasks && activeTab)}>Tasks</Link>
        <Link to="/w/$slug/p/$key/me" params={params} className={cn(tab, onMyTasks && activeTab)}>My Tasks</Link>
        <Link to="/w/$slug/p/$key/features" params={params} className={cn(tab, onFeatures && activeTab)}>Features</Link>
        <Link to="/w/$slug/p/$key/meetings" params={params} className={cn(tab, "gap-1.5", onMeetings && activeTab)}>
          Meetings
          {meetingOpen && <span className="size-1.5 rounded-full bg-emerald-400" title="Meeting in progress" />}
        </Link>
        <Link to="/w/$slug/p/$key/settings" params={params} className={cn(tab, onSettings && activeTab)}>Settings</Link>
      </div>
    </>
  );
}

function ProjectSwitcher({ slug, projectKey, tab }: { slug: string; projectKey: string; tab: "tasks" | "me" | "meetings" | "features" | "settings" }) {
  const navigate = useNavigate();
  const projects = useWorkspace((s) => s.view.projects);
  const options = useMemo(
    () => Object.values(projects).filter((p) => p.archivedAt === null || p.key === projectKey).sort((a, b) => a.name.localeCompare(b.name)),
    [projects, projectKey],
  );
  const current = options.find((p) => p.key === projectKey);

  // Switching Projects keeps you on the same tab.
  const open = (key: string) => {
    const params = { slug, key };
    if (tab === "settings") navigate({ to: "/w/$slug/p/$key/settings", params });
    else if (tab === "me") navigate({ to: "/w/$slug/p/$key/me", params });
    else if (tab === "features") navigate({ to: "/w/$slug/p/$key/features", params });
    else if (tab === "meetings") navigate({ to: "/w/$slug/p/$key/meetings", params });
    else navigate({ to: "/w/$slug/p/$key", params });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="mr-1 h-9 min-w-0 shrink-0 px-2 sm:h-8" aria-label="Switch Project">
          <span className="font-mono text-xs text-muted-foreground">{projectKey}</span>
          <span className="max-w-[8rem] truncate sm:max-w-[16rem]">{current?.name ?? projectKey}</span>
          <ChevronsUpDownIcon className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        {options.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => open(p.key)}>
            <span className="w-12 font-mono text-xs text-muted-foreground">{p.key}</span>
            <span className="flex-1 truncate">{p.name}</span>
            {p.key === projectKey && <CheckIcon />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate({ to: "/w/$slug", params: { slug } })}>
          <FolderIcon /> Back to Workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConnectionBadge() {
  const status = useWorkspace((s) => s.status);
  const pending = useWorkspace((s) => s.pending.length);
  if (status === "online") return pending > 0 ? <span className="shrink-0 text-xs text-muted-foreground">Saving…</span> : null;
  const label = { connecting: "Connecting…", offline: "Reconnecting…", removed: "Removed from Workspace" }[status];
  return <span className="shrink-0 text-xs text-amber-400">{label}</span>;
}

function Gate({ children }: { children: React.ReactNode }) {
  const ready = useWorkspace((s) => s.memberId !== null);
  const status = useWorkspace((s) => s.status);
  if (status === "removed") return <p className="text-muted-foreground">You no longer have access to this Workspace.</p>;
  if (!ready) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  return <>{children}</>;
}
