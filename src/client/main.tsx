import { ActivityPage } from "./routes/activity";
import { createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider, useParams } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import "./index.css";
import { AdminPage } from "./routes/admin";
import { FeaturesPage, FeaturePage } from "./routes/features";
import { HomePage } from "./routes/home";
import { PastMeetingPage, ProjectMeetingsPage } from "./routes/meetings";
import { MyTasksPage } from "./routes/my-tasks";
import { ProjectLayout, ProjectMyTasksPage, ProjectTasksPage } from "./routes/project";
import { ProjectsPage } from "./routes/projects";
import { TaskKeyRedirect, TaskPage } from "./routes/task";
import { WorkspaceLayout } from "./routes/workspace";

const rootRoute = createRootRoute({
  component: () => (
    <div className="mx-auto max-w-3xl px-3 pt-3 pb-24 sm:px-4 sm:pt-4">
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

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });
const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: AdminPage });
const workspaceRoute = createRoute({ getParentRoute: () => rootRoute, path: "/w/$slug", component: WorkspaceLayout });
const activityRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/activity", component: ActivityPage });
const projectsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/", component: ProjectsPage });
const projectRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/p/$key", component: ProjectLayout });
const projectTasksRoute = createRoute({ getParentRoute: () => projectRoute, path: "/", component: ProjectTasksPage });
const projectMyTasksRoute = createRoute({ getParentRoute: () => projectRoute, path: "/me", component: ProjectMyTasksPage });
const taskRoute = createRoute({ getParentRoute: () => projectRoute, path: "/t/$number", component: TaskPage });
const featuresRoute = createRoute({ getParentRoute: () => projectRoute, path: "/features", component: FeaturesPage });
const featureRoute = createRoute({ getParentRoute: () => projectRoute, path: "/features/$featureId", component: FeaturePage });
const meetingsRoute = createRoute({ getParentRoute: () => projectRoute, path: "/meetings", component: ProjectMeetingsPage });
const pastMeetingRoute = createRoute({ getParentRoute: () => projectRoute, path: "/meetings/$meetingId", component: PastMeetingPage });
// Short links by Task key (e.g. /w/acme/t/WEB-12) resolve into the Project.
const taskKeyRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/t/$taskKey", component: TaskKeyRedirect });
const myTasksRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/me", component: MyTasksPage });

const routeTree = rootRoute.addChildren([
  homeRoute,
  adminRoute,
  workspaceRoute.addChildren([
    projectsRoute,
    activityRoute,
    projectRoute.addChildren([projectTasksRoute, projectMyTasksRoute, taskRoute, featuresRoute, featureRoute, meetingsRoute, pastMeetingRoute]),
    taskKeyRoute,
    myTasksRoute,
  ]),
]);

const router = createRouter({ routeTree });

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
