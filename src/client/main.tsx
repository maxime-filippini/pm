import { createRootRoute, createRoute, createRouter, Link, Outlet, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toasts } from "./components/Toasts";
import "./index.css";
import { AdminPage } from "./routes/admin";
import { HomePage } from "./routes/home";
import { MyTasksPage } from "./routes/my-tasks";
import { ProjectPage } from "./routes/project";
import { ProjectsPage } from "./routes/projects";
import { TaskPage } from "./routes/task";
import { WorkspaceLayout } from "./routes/workspace";

const rootRoute = createRootRoute({
  component: () => (
    <div className="mx-auto max-w-3xl p-4 pb-24">
      <header className="mb-4">
        <Link to="/" className="text-lg font-semibold">PM</Link>
      </header>
      <Outlet />
      <Toasts />
    </div>
  ),
});

const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });
const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: "/admin", component: AdminPage });
const workspaceRoute = createRoute({ getParentRoute: () => rootRoute, path: "/w/$slug", component: WorkspaceLayout });
const projectsRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/", component: ProjectsPage });
const projectRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/p/$key", component: ProjectPage });
const taskRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/t/$taskKey", component: TaskPage });
const myTasksRoute = createRoute({ getParentRoute: () => workspaceRoute, path: "/me", component: MyTasksPage });

const routeTree = rootRoute.addChildren([
  homeRoute,
  adminRoute,
  workspaceRoute.addChildren([projectsRoute, projectRoute, taskRoute, myTasksRoute]),
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
