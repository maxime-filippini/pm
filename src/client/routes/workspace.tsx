import { Link, Outlet, useMatchRoute, useParams } from "@tanstack/react-router";
import { ActivityIcon, CheckSquareIcon, FolderIcon, LightbulbIcon, ListTodoIcon, SettingsIcon, UsersIcon } from "lucide-react";
import { AppShell, activeNavItem as activeItem, navItem as item } from "@/components/AppShell";
import { QuickJump } from "@/components/QuickJump";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../store/workspace";
import { WorkspaceProvider } from "../sync/context";

export function WorkspaceLayout() {
  const { slug } = useParams({ from: "/w/$slug" });
  return <WorkspaceProvider key={slug} slug={slug}><WorkspaceShell slug={slug} /></WorkspaceProvider>;
}

function WorkspaceShell({ slug }: { slug: string }) {
  const { key } = useParams({ strict: false });
  const projects = useWorkspace((s) => s.view.projects);
  const project = Object.values(projects).find((p) => p.key === key);
  const navigation = key ? <ProjectNavigation slug={slug} projectKey={key} /> : <>
    <Link to="/w/$slug" params={{ slug }} activeOptions={{ exact: true }} className={item} activeProps={{ className: activeItem }}><FolderIcon className="size-4" /> Projects</Link>
    <Link to="/w/$slug/me" params={{ slug }} className={item} activeProps={{ className: activeItem }}><CheckSquareIcon className="size-4" /> My Tasks</Link>
    <Link to="/w/$slug/activity" params={{ slug }} className={item} activeProps={{ className: activeItem }}><ActivityIcon className="size-4" /> Activity</Link>
  </>;
  return <AppShell slug={slug} project={project} projects={Object.values(projects)} navigation={navigation}
    search={<QuickJump key={key ?? "workspace"} navigation projectKey={key} projectId={project?.id} />}
    status={<ConnectionBadge />}>
    <Gate><Outlet /></Gate>
  </AppShell>;
}

function ProjectNavigation({ slug, projectKey }: { slug: string; projectKey: string }) {
  const matchRoute = useMatchRoute();
  const { number } = useParams({ strict: false });
  const params = { slug, key: projectKey };
  const onMyTasks = Boolean(matchRoute({ to: "/w/$slug/p/$key/me", params }));
  const onFeatures = Boolean(matchRoute({ to: "/w/$slug/p/$key/features", params, fuzzy: true }));
  const onMeetings = Boolean(matchRoute({ to: "/w/$slug/p/$key/meetings", params, fuzzy: true }));
  const onSettings = Boolean(matchRoute({ to: "/w/$slug/p/$key/settings", params }));
  const onTasks = !onMyTasks && !onFeatures && !onMeetings && !onSettings && (Boolean(matchRoute({ to: "/w/$slug/p/$key", params })) || Boolean(number));
  const meetingOpen = useWorkspace((s) => {
    const project = Object.values(s.view.projects).find((p) => p.key === projectKey);
    return Boolean(project && Object.values(s.view.meetings).some((m) => m.projectId === project.id && m.endedAt === null));
  });
  return <div className="space-y-2">
    <div className="space-y-1">
      <Link to="/w/$slug/p/$key" params={params} activeOptions={{ exact: true }} className={cn(item, onTasks && activeItem)} aria-current={onTasks ? "page" : undefined}><ListTodoIcon className="size-4" /> Tasks</Link>
      <Link to="/w/$slug/p/$key/me" params={params} className={cn(item, onMyTasks && activeItem)} aria-current={onMyTasks ? "page" : undefined}><CheckSquareIcon className="size-4" /> My Tasks</Link>
      <Link to="/w/$slug/p/$key/features" params={params} className={cn(item, onFeatures && activeItem)} aria-current={onFeatures ? "page" : undefined}><LightbulbIcon className="size-4" /> Features</Link>
      <Link to="/w/$slug/p/$key/meetings" params={params} className={cn(item, onMeetings && activeItem)} aria-current={onMeetings ? "page" : undefined}><UsersIcon className="size-4" /> Meetings{meetingOpen && <span className="ml-auto size-1.5 rounded-full bg-emerald-400" title="Meeting in progress" />}</Link>
      <Link to="/w/$slug/p/$key/settings" params={params} className={cn(item, onSettings && activeItem)} aria-current={onSettings ? "page" : undefined}><SettingsIcon className="size-4" /> Settings</Link>
    </div>
  </div>;
}

function ConnectionBadge() {
  const status = useWorkspace((s) => s.status), pending = useWorkspace((s) => s.pending.length);
  if (status === "online") return pending > 0 ? <span role="status" className="text-xs text-muted-foreground">Saving…</span> : null;
  return <span role="status" className="text-xs text-amber-400">{{ connecting: "Connecting…", offline: "Reconnecting…", removed: "Removed from Workspace" }[status]}</span>;
}
function Gate({ children }: { children: React.ReactNode }) {
  const ready = useWorkspace((s) => s.memberId !== null), status = useWorkspace((s) => s.status);
  if (status === "removed") return <p className="text-muted-foreground">You no longer have access to this Workspace.</p>;
  if (!ready) return <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>;
  return <>{children}</>;
}
