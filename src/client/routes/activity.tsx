import { ActivityFeed } from "@/components/ActivityFeed";
import { PageHeader } from "@/components/PageHeader";
export function ActivityPage() {
  return <div className="space-y-6"><PageHeader title="Workspace Activity" description="Follow changes across every Project. Restore deleted Tasks and Meetings even after the Undo message has gone." /><ActivityFeed /></div>;
}
