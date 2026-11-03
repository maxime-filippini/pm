import { createRootRoute, createRoute, createRouter, lazyRouteComponent, Link, Outlet, RouterProvider, useParams } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";

const rootRoute = createRootRoute({
  component: () => (
    <div className="mx-auto max-w-5xl px-3 pt-3 pb-24 sm:px-4 sm:pt-4">
      <AppHeader />
      <Outlet />
      <Toaster position="bottom-center" />
    </div>
  ),
});

/** Workspace pages carry their own top bar. */
function AppHeader() {
  const { slug } = useParams({ strict: false });
  if (slug) return null;
  return (
    <header className="mb-4">
      <Link to="/" className="font-heading text-lg font-semibold">PM</Link>
    </header>
  );
}

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: lazyRouteComponent(() => import("./routes/home"), "HomePage") });
const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: lazyRouteComponent(() => import("./routes/admin"), "AdminPage") });
const workspaceRoute = createRoute({ getParentRoute: () => rootRoute, path: "/w/$slug", component: lazyRouteComponent(() => import("./routes/workspace"), "WorkspaceLayout") });
const activityRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/activity", component: lazyRouteComponent(() => import("./routes/activity"), "ActivityPage") });
const projectsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/", component: lazyRouteComponent(() => import("./routes/projects"), "ProjectsPage") });
const projectRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/p/$key", component: lazyRouteComponent(() => import("./routes/project-layout"), "ProjectLayout") });
const settingsRoute = createRoute({ getParentRoute: () => projectRoute, path: "/settings", component: lazyRouteComponent(() => import("./routes/settings"), "ProjectSettingsPage") });
const projectTasksRoute = createRoute({ getParentRoute: () => projectRoute, path: "/", component: lazyRouteComponent(() => import("./routes/project"), "ProjectTasksPage") });
const projectMyTasksRoute = createRoute({ getParentRoute: () => projectRoute, path: "/me", component: lazyRouteComponent(() => import("./routes/project"), "ProjectMyTasksPage") });
const taskRoute = createRoute({ getParentRoute: () => projectRoute, path: "/t/$number", component: lazyRouteComponent(() => import("./routes/task"), "TaskPage") });
const featuresRoute = createRoute({ getParentRoute: () => projectRoute, path: "/features", component: lazyRouteComponent(() => import("./routes/features"), "FeaturesPage") });
const featureRoute = createRoute({ getParentRoute: () => projectRoute, path: "/features/$featureId", component: lazyRouteComponent(() => import("./routes/features"), "FeaturePage") });
const meetingsRoute = createRoute({ getParentRoute: () => projectRoute, path: "/meetings", component: lazyRouteComponent(() => import("./routes/meetings"), "ProjectMeetingsPage") });
const pastMeetingRoute = createRoute({ getParentRoute: () => projectRoute, path: "/meetings/$meetingId", component: lazyRouteComponent(() => import("./routes/meetings"), "PastMeetingPage") });
// Short links by Task key (e.g. /w/acme/t/WEB-12) resolve into the Project.
const taskKeyRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/t/$taskKey", component: lazyRouteComponent(() => import("./routes/task"), "TaskKeyRedirect") });
const myTasksRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/me", component: lazyRouteComponent(() => import("./routes/my-tasks"), "MyTasksPage") });

const routeTree = rootRoute.addChildren([
  homeRoute,
  adminRoute,
  workspaceRoute.addChildren([
    projectsRoute,
    activityRoute,
    projectRoute.addChildren([settingsRoute, projectTasksRoute, projectMyTasksRoute, taskRoute, featuresRoute, featureRoute, meetingsRoute, pastMeetingRoute]),
    taskKeyRoute,
    myTasksRoute,
  ]),
]);

function LoadingPage() {
  return <p role="status" className="rounded-lg border p-6 text-sm text-muted-foreground">Loading page…</p>;
}
function PageError() {
  return <div role="alert" className="space-y-3 rounded-lg border p-6">
    <h1 className="font-heading text-xl font-semibold">This page could not load</h1>
    <p className="text-sm text-muted-foreground">Check your connection and reload to try again.</p>
    <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => location.reload()}>Reload page</button>
    <Link to="/" className="ml-3 text-sm underline">Go home</Link>
  </div>;
}
const router = createRouter({
  routeTree, defaultPendingComponent: LoadingPage, defaultErrorComponent: PageError,
  defaultPendingMs: 150, defaultPendingMinMs: 200,
  defaultNotFoundComponent: () => <div className="space-y-3 py-6"><h1 className="font-heading text-xl font-semibold">Page not found</h1><Link to="/" className="underline">Go home</Link></div>,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
