import type { Feature, FeatureStatus } from "../../shared/entities";
import { useWorkspace } from "../store/workspace";
import { useSocket } from "../sync/context";
import { Button } from "./ui/button";

export const FEATURE_LABEL: Record<FeatureStatus, string> = { proposed: "Proposed", accepted: "Accepted", rejected: "Rejected", done: "Done" };

export function FeatureDonePrompt({ feature }: { feature: Feature }) {
  const socket = useSocket();
  const tasks = useWorkspace((s) => s.view.tasks);
  const linked = Object.values(tasks).filter((t) => t.featureId === feature.id);
  if (feature.status !== "accepted" || linked.length === 0 || linked.some((t) => t.status === "todo" || t.status === "in_progress")) return null;
  return <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-3 text-sm">
    <span>All linked Tasks are done or canceled. Mark Feature done?</span>
    <Button size="sm" onClick={() => socket.send("feature.setStatus", { id: feature.id, status: "done" })}>Mark done</Button>
  </div>;
}

