import { expect, it } from "vitest";
import { searchDestination } from "../../src/client/lib/search";
import type { Meeting, SearchResult } from "../../src/shared/entities";
it("opens unresolved/current Topics on the agenda and closed Topics in past Meetings", () => {
  const result: SearchResult = { type: "topic", id: "topic", title: "Topic", projectId: "project", projectKey: "WEB", meetingId: null };
  expect(searchDestination("main", result, {})).toBe("/w/main/p/WEB/meetings#topic-topic");
  const open = { id: "meeting", endedAt: null } as Meeting;
  expect(searchDestination("main", { ...result, meetingId: "meeting" }, { meeting: open })).toBe("/w/main/p/WEB/meetings#topic-topic");
  expect(searchDestination("main", { ...result, meetingId: "meeting" }, { meeting: { ...open, endedAt: 10 } })).toBe("/w/main/p/WEB/meetings/meeting#topic-topic");
});
