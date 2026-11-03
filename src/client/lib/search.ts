import type { SearchResult, Meeting } from "../../shared/entities";
export function searchDestination(slug: string, result: SearchResult, meetings: Record<string, Meeting>): string {
  const base = `/w/${encodeURIComponent(slug)}/p/${result.projectKey}`;
  if (result.type === "task") return base + "/t/" + result.taskNumber;
  if (result.type === "feature") return base + "/features/" + result.id;
  const meeting = result.meetingId ? meetings[result.meetingId] : null;
  return base + "/meetings" + (meeting?.endedAt != null ? "/" + meeting.id : "") + "#topic-" + result.id;
}
