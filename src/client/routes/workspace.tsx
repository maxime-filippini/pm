import { Dialog } from "radix-ui";
import { QuickJump } from "@/components/QuickJump";
import { Link, Outlet, useLocation, useMatchRoute, useNavigate, useParams } from "@tanstack/react-router";
import { ActivityIcon, ArrowLeftIcon, CheckIcon, CheckSquareIcon, ChevronsUpDownIcon, FolderIcon, LightbulbIcon, ListTodoIcon, MenuIcon, SettingsIcon, UsersIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useWorkspace } from "../store/workspace";
import { WorkspaceProvider } from "../sync/context";

export function WorkspaceLayout() {
  const { slug } = useParams({ from: "/w/$slug" });
  return <WorkspaceProvider slug={slug}><WorkspaceShell slug={slug} /></WorkspaceProvider>;
}

function WorkspaceShell({ slug }: { slug: string }) {
  const { key } = useParams({ strict: false });
  const href = useLocation({ select: (location) => location.href });
  const project = useWorkspace((s) => Object.values(s.view.projects).find((p) => p.key === key));
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [href]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const close = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <a href="#workspace-content" className="sr-only fixed top-2 left-2 z-50 rounded bg-background p-3 focus:not-sr-only">Skip to content</a>
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:h-dvh lg:w-60 lg:flex-col lg:items-stretch lg:gap-6 lg:border-r lg:border-b-0 lg:bg-muted/10 lg:px-4 lg:py-7">
      <div className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none lg:px-3">
        <Dialog.Trigger asChild><Button variant="ghost" size="icon" className="size-10 lg:hidden" aria-label="Open navigation"><MenuIcon /></Button></Dialog.Trigger>
        <Link to="/" className="shrink-0 font-heading text-lg font-semibold tracking-tight" title="All Workspaces">PM</Link>
        <div className="min-w-0 lg:hidden">
          <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{key ? "Project view" : "Workspace view"}</p>
          <p className="truncate text-sm">{project?.name ?? key ?? slug}</p>
        </div>
      </div>
      <QuickJump navigation />
      <div className="hidden min-h-0 flex-1 overflow-y-auto lg:block"><Navigation slug={slug} projectKey={key} /></div>
      <div className="hidden px-3 lg:block"><ConnectionBadge /></div>
    </header>

    <main id="workspace-content" tabIndex={-1} className="min-w-0 outline-none lg:pl-60">
      <div className="w-full px-4 pt-8 pb-24 sm:px-8 sm:pt-10 lg:px-10 xl:px-12">
        <div className="mb-3 lg:hidden"><ConnectionBadge /></div>
        <Gate><Outlet /></Gate>
      </div>
    </main>

    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 lg:hidden" />
      <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-3rem))] flex-col bg-background px-5 py-5 shadow-xl lg:hidden">
        <Dialog.Title className="sr-only">Navigation</Dialog.Title>
        <Dialog.Description className="sr-only">{key ? "Navigate this Project, switch Projects or return to the Workspace." : "Navigate this Workspace or open a Project."}</Dialog.Description>
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" className="font-heading text-lg font-semibold" title="All Workspaces" onClick={() => setOpen(false)}>PM</Link>
          <Dialog.Close asChild><Button variant="ghost" size="icon" className="size-10" aria-label="Close navigation"><XIcon /></Button></Dialog.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto"><Navigation slug={slug} projectKey={key} onNavigate={() => setOpen(false)} /></div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}

const item = "flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground";
const activeItem = "bg-muted/70 font-medium text-foreground";
const groupLabel = "px-3 text-[11px] font-medium tracking-widest text-muted-foreground/70 uppercase";

function Navigation({ slug, projectKey, onNavigate }: { slug: string; projectKey?: string; onNavigate?: () => void }) {
  return <nav aria-label={projectKey ? "Project navigation" : "Workspace navigation"} className="space-y-8" onClick={(event) => {
    if ((event.target as HTMLElement).closest("a")) onNavigate?.();
  }}>
    {projectKey ? <>
      <ProjectNavigation slug={slug} projectKey={projectKey} onNavigate={onNavigate} />
      <Link to="/w/$slug" params={{ slug }} activeOptions={{ exact: true }} className={item}><ArrowLeftIcon className="size-4" /> Back to Workspace</Link>
    </> : <div className="space-y-2">
        <div className="space-y-1 pb-3">
          <p className={groupLabel}>Workspace view</p>
          <p className="truncate px-3 text-sm font-medium">{slug}</p>
        </div>
        <Link to="/w/$slug" params={{ slug }} activeOptions={{ exact: true }} className={item} activeProps={{ className: activeItem }}>
          <FolderIcon className="size-4" /> Projects
        </Link>
        <Link to="/w/$slug/me" params={{ slug }} className={item} activeProps={{ className: activeItem }}><CheckSquareIcon className="size-4" /> My Tasks</Link>
        <Link to="/w/$slug/activity" params={{ slug }} className={item} activeProps={{ className: activeItem }}><ActivityIcon className="size-4" /> Activity</Link>
      </div>
    }
  </nav>;
}

function ProjectNavigation({ slug, projectKey, onNavigate }: { slug: string; projectKey: string; onNavigate?: () => void }) {
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
    <p className={groupLabel}>Project view</p>
    <ProjectSwitcher slug={slug} projectKey={projectKey} tab={onSettings ? "settings" : onMyTasks ? "me" : onFeatures ? "features" : onMeetings ? "meetings" : "tasks"} onNavigate={onNavigate} />
    <div className="space-y-1 pt-2">
      <Link to="/w/$slug/p/$key" params={params} activeOptions={{ exact: true }} className={cn(item, onTasks && activeItem)} aria-current={onTasks ? "page" : undefined}><ListTodoIcon className="size-4" /> Tasks</Link>
      <Link to="/w/$slug/p/$key/me" params={params} className={cn(item, onMyTasks && activeItem)} aria-current={onMyTasks ? "page" : undefined}><CheckSquareIcon className="size-4" /> My Tasks</Link>
      <Link to="/w/$slug/p/$key/features" params={params} className={cn(item, onFeatures && activeItem)} aria-current={onFeatures ? "page" : undefined}><LightbulbIcon className="size-4" /> Features</Link>
      <Link to="/w/$slug/p/$key/meetings" params={params} className={cn(item, onMeetings && activeItem)} aria-current={onMeetings ? "page" : undefined}><UsersIcon className="size-4" /> Meetings{meetingOpen && <span className="ml-auto size-1.5 rounded-full bg-emerald-400" title="Meeting in progress" />}</Link>
      <Link to="/w/$slug/p/$key/settings" params={params} className={cn(item, onSettings && activeItem)} aria-current={onSettings ? "page" : undefined}><SettingsIcon className="size-4" /> Settings</Link>
    </div>
  </div>;
}

function ProjectSwitcher({ slug, projectKey, tab, onNavigate }: { slug: string; projectKey: string; tab: "tasks" | "me" | "meetings" | "features" | "settings"; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const projects = useWorkspace((s) => s.view.projects);
  const options = useMemo(() => Object.values(projects).filter((p) => p.archivedAt === null || p.key === projectKey).sort((a, b) => a.name.localeCompare(b.name)), [projects, projectKey]);
  const current = options.find((p) => p.key === projectKey);
  const open = (key: string) => {
    const params = { slug, key };
    if (tab === "settings") void navigate({ to: "/w/$slug/p/$key/settings", params });
    else if (tab === "me") void navigate({ to: "/w/$slug/p/$key/me", params });
    else if (tab === "features") void navigate({ to: "/w/$slug/p/$key/features", params });
    else if (tab === "meetings") void navigate({ to: "/w/$slug/p/$key/meetings", params });
    else void navigate({ to: "/w/$slug/p/$key", params });
    onNavigate?.();
  };
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="ghost" className="h-auto min-h-11 w-full justify-start gap-2 px-3 py-2" aria-label="Switch Project">
      <span className="min-w-0 flex-1 text-left"><span className="block truncate font-medium">{current?.name ?? projectKey}</span><span className="block font-mono text-[10px] text-muted-foreground">{projectKey}</span></span>
      <ChevronsUpDownIcon className="text-muted-foreground" />
    </Button></DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="z-[60] w-64">
      <DropdownMenuLabel>Projects</DropdownMenuLabel>
      {options.map((p) => <DropdownMenuItem key={p.id} onSelect={() => open(p.key)}>
        <span className="w-12 font-mono text-xs text-muted-foreground">{p.key}</span><span className="flex-1 truncate">{p.name}</span>{p.key === projectKey && <CheckIcon />}
      </DropdownMenuItem>)}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => { void navigate({ to: "/w/$slug", params: { slug } }); onNavigate?.(); }}><FolderIcon /> Back to Workspace</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
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
