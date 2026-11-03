import { Outlet, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { Empty } from "@/components/common";
import { setLastProject } from "../last-project";
import { useWorkspace } from "../store/workspace";

/** Every page inside a Project renders here, under the Project navigation in the shared shell. */
export function ProjectLayout() {
  const { slug, key } = useParams({ from: "/w/$slug/p/$key" });
  const exists = useWorkspace((s) => Object.values(s.view.projects).some((p) => p.key === key));
  useEffect(() => setLastProject(slug, exists ? key : null), [slug, key, exists]);
  if (!exists) return <Empty>No Project with key {key}.</Empty>;
  return <Outlet />;
}

