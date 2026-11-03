import { Dialog } from "radix-ui";
import { Link, useLocation, useParams } from "@tanstack/react-router";
import { Building2Icon, CheckIcon, ChevronsUpDownIcon, FolderIcon, LayersIcon, MenuIcon, ShieldIcon, XIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { Project } from "../../shared/entities";
import { useMe } from "../api";
import { Button } from "./ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";

export const navItem = "flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground";
export const activeNavItem = "bg-muted/70 font-medium text-foreground";

const projectDestinations = {
  tasks: "/w/$slug/p/$key", me: "/w/$slug/p/$key/me", features: "/w/$slug/p/$key/features",
  meetings: "/w/$slug/p/$key/meetings", settings: "/w/$slug/p/$key/settings",
} as const;

/** The same navigation frame serves Home, Admin, Workspace and Project routes. */
export function AppShell({ slug, project, projects = [], navigation, search, status, children }: {
  slug?: string; project?: Project; projects?: Project[]; navigation?: ReactNode;
  search?: ReactNode; status?: ReactNode; children: ReactNode;
}) {
  const { me } = useMe();
  const { key } = useParams({ strict: false });
  const { href, pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const workspace = me?.workspaces.find((w) => w.slug === slug);
  const admin = pathname === "/admin";
  const scope = key ? "Project view" : slug ? "Workspace view" : admin ? "Admin view" : "Home";
  const name = key ? project?.name ?? key : slug ? workspace?.name ?? slug : admin ? "Administration" : "All Workspaces";
  const Icon = key ? FolderIcon : admin ? ShieldIcon : Building2Icon;
  const section = pathname.split("/")[5];
  const destination = projectDestinations[section as keyof typeof projectDestinations] ?? projectDestinations.tasks;
  useEffect(() => setOpen(false), [href]);
  useEffect(() => {
    const onSearch = (event: KeyboardEvent) => {
      if (search && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") setOpen(false);
    };
    window.addEventListener("keydown", onSearch);
    return () => window.removeEventListener("keydown", onSearch);
  }, [search]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const close = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);

  const switcher = <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" className="h-auto min-h-14 w-full justify-start gap-3 px-3 py-2 text-left" aria-label="Switch view">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"><Icon className="size-4" /></span>
        <span className="min-w-0 flex-1"><span className="block truncate font-medium">{name}</span><span className="block truncate text-xs font-normal text-muted-foreground">{scope}{key && workspace ? ` · ${workspace.name}` : ""}</span></span>
        <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" className="z-[60] w-72 max-w-[calc(100vw-2rem)]">
      {slug && <>
        <DropdownMenuLabel>{workspace?.name ?? slug}</DropdownMenuLabel>
        <DropdownMenuItem asChild><Link to="/w/$slug" params={{ slug }} onClick={() => setOpen(false)}><Building2Icon /><span className="flex-1">Workspace view</span>{!key && <CheckIcon />}</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        {projects.filter((p) => p.archivedAt === null || p.key === key).sort((a, b) => a.name.localeCompare(b.name)).map((p) => <DropdownMenuItem key={p.id} asChild>
          <Link to={destination} params={{ slug, key: p.key }} onClick={() => setOpen(false)}><FolderIcon /><span className="min-w-0 flex-1 truncate">{p.name}</span><span className="font-mono text-[10px] text-muted-foreground">{p.key}</span>{p.key === key && <CheckIcon />}</Link>
        </DropdownMenuItem>)}
        {projects.length === 0 && <DropdownMenuItem disabled>No Projects yet</DropdownMenuItem>}
        <DropdownMenuSeparator />
      </>}
      <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
      {me?.workspaces.filter((w) => w.slug !== slug).map((w) => <DropdownMenuItem key={w.id} asChild><Link to="/w/$slug" params={{ slug: w.slug }} onClick={() => setOpen(false)}><Building2Icon /><span className="truncate">{w.name}</span></Link></DropdownMenuItem>)}
      <DropdownMenuItem asChild><Link to="/" onClick={() => setOpen(false)}><LayersIcon /> All Workspaces</Link></DropdownMenuItem>
      {me?.isAdmin && <><DropdownMenuSeparator /><DropdownMenuItem asChild><Link to="/admin" onClick={() => setOpen(false)}><ShieldIcon /> Admin view</Link></DropdownMenuItem></>}
    </DropdownMenuContent>
  </DropdownMenu>;

  const nav = <nav aria-label={key ? "Project navigation" : slug ? "Workspace navigation" : "App navigation"} className="space-y-1" onClick={(event) => {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  }}>
    {navigation ?? <>
      <p className="px-3 pb-2 text-xs font-medium text-muted-foreground">{admin ? "Administration" : "Workspaces"}</p>
      {admin ? <Link to="/admin" className={navItem} activeProps={{ className: activeNavItem }}><ShieldIcon className="size-4" /> Workspaces and Members</Link> : me?.workspaces.map((w) => <Link key={w.id} to="/w/$slug" params={{ slug: w.slug }} className={navItem}><Building2Icon className="size-4" /><span className="truncate">{w.name}</span></Link>)}
    </>}
  </nav>;
  const footer = <div className="space-y-1">
    {slug && key && <Link to="/w/$slug" params={{ slug }} activeOptions={{ exact: true }} className={navItem} onClick={() => setOpen(false)}><Building2Icon className="size-4" /> Workspace view</Link>}
    <Link to="/" activeOptions={{ exact: true }} className={navItem} activeProps={{ className: activeNavItem }} onClick={() => setOpen(false)}><LayersIcon className="size-4" /> All Workspaces</Link>
    {me?.isAdmin && <Link to="/admin" className={navItem} activeProps={{ className: activeNavItem }} onClick={() => setOpen(false)}><ShieldIcon className="size-4" /> Admin view</Link>}
    {status}
    {me && <p className="truncate px-3 pt-3 text-xs text-muted-foreground" title={me.email}>{me.member?.name ?? me.email}</p>}
  </div>;

  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <a href="#app-content" className="sr-only fixed top-2 left-2 z-50 rounded bg-background p-3 focus:not-sr-only">Skip to content</a>
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:fixed lg:inset-y-0 lg:left-0 lg:h-dvh lg:w-64 lg:flex-col lg:items-stretch lg:gap-4 lg:border-r lg:border-b-0 lg:bg-muted/10 lg:px-3 lg:py-5">
      <div className="flex min-w-0 flex-1 items-center gap-3 lg:flex-none lg:px-3">
        <Dialog.Trigger asChild><Button variant="ghost" size="icon" className="size-10 lg:hidden" aria-label="Open navigation"><MenuIcon /></Button></Dialog.Trigger>
        <Link to="/" className="shrink-0 font-heading text-lg font-semibold tracking-tight" title="All Workspaces">PM</Link>
        <div className="min-w-0 lg:hidden"><p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{scope}</p><p className="truncate text-sm">{name}</p></div>
      </div>
      <div className="hidden lg:block">{switcher}</div>
      {search}
      <div className="hidden min-h-0 flex-1 overflow-y-auto lg:block">{nav}</div>
      <div className="hidden lg:block">{footer}</div>
    </header>
    <main id="app-content" tabIndex={-1} className="min-w-0 outline-none lg:pl-64">
      <div className="w-full px-4 pt-8 pb-24 sm:px-8 sm:pt-10 lg:px-10 xl:px-12">
        <div className="lg:hidden">{status}</div>
        {children}
      </div>
    </main>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-40 bg-black/60 lg:hidden" />
      <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-3rem))] flex-col gap-5 bg-background px-3 py-5 shadow-xl lg:hidden">
        <Dialog.Title className="sr-only">Navigation</Dialog.Title>
        <Dialog.Description className="sr-only">Switch views and navigate the selected Project, Workspace or Administration.</Dialog.Description>
        <div className="flex items-center justify-between px-3"><Link to="/" className="font-heading text-lg font-semibold" onClick={() => setOpen(false)}>PM</Link><Dialog.Close asChild><Button variant="ghost" size="icon" className="size-10" aria-label="Close navigation"><XIcon /></Button></Dialog.Close></div>
        {switcher}
        <div className="min-h-0 flex-1 overflow-y-auto">{nav}</div>
        {footer}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
