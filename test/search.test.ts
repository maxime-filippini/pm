import { describe, expect, it } from "vitest";
import { uuidv7 } from "../src/shared/ids";
import type { SearchResult } from "../src/shared/entities";
import { connect, freshWorkspaceId, newMember } from "./helpers";
describe("Workspace search", () => {
  it("scopes every result type to the selected Project before applying the limit", async () => {
    const client = await connect(freshWorkspaceId(), newMember());
    const first = uuidv7(), selected = uuidv7();
    for (const [projectId, key] of [[first, "WEB"], [selected, "APP"]] as const) {
      await client.command("project.create", { id: projectId, key, name: key });
      await client.command("task.create", { id: uuidv7(), projectId, title: "Scope check Task" });
      await client.command("feature.create", { id: uuidv7(), projectId, title: "Scope check Feature" });
      await client.command("topic.create", { id: uuidv7(), projectId, title: "Scope check Topic" });
    }
    const scoped = (await client.query("search", { text: "Scope check", projectId: selected })).data as { items: SearchResult[] };
    expect(scoped.items.map((r) => r.type).sort()).toEqual(["feature", "task", "topic"]);
    expect(scoped.items.every((r) => r.projectId === selected)).toBe(true);
    const limited = (await client.query("search", { text: "Scope check", projectId: selected, limit: 1 })).data as { items: SearchResult[] };
    expect(limited.items).toHaveLength(1);
    expect(limited.items[0]?.projectId).toBe(selected);
    expect((await client.query("search", { text: "WEB-1", projectId: selected })).data).toEqual({ items: [] });
    expect((await client.query("search", { text: "APP-1", projectId: selected })).data).toMatchObject({ items: [{ type: "task", projectId: selected }] });
    expect((await client.query("search", { text: "Scope check", projectId: uuidv7() })).data).toEqual({ items: [] });
    expect(((await client.query("search", { text: "Scope check" })).data as { items: SearchResult[] }).items).toHaveLength(6);
    await client.command("project.archive", { id: selected });
    expect((await client.query("search", { text: "Scope check", projectId: selected })).data).toEqual({ items: [] });
  });
  it("ranks exact keys, prefixes and substrings; escapes wildcards and excludes archived/deleted work", async () => {
    const workspace = freshWorkspaceId();
    const client = await connect(workspace, newMember());
    const projectId = uuidv7(), id = uuidv7(), featureId = uuidv7(), topicId = uuidv7();
    await client.command("project.create", { id: projectId, key: "WEB", name: "Web" });
    await client.command("task.create", { id, projectId, title: "A matching title" });
    await client.command("feature.create", { id: featureId, projectId, title: "WEB-1 title prefix" });
    await client.command("topic.create", { id: topicId, projectId, title: "Other WEB-1 title" });
    const search = async (text: string, limit?: number) => ((await client.query("search", { text, limit })).data as { items: SearchResult[] }).items;
    expect((await search(" web-1 ")).map((r) => r.type)).toEqual(["task", "feature", "topic"]);
    expect(await search("web-1", 1)).toHaveLength(1);
    await client.command("task.update", { id, title: "Literal 50%_\\ path" });
    for (const text of ["%", "_", "\\"]) expect((await search(text)).map((r) => r.id)).toEqual([id]);
    await client.command("task.delete", { id });
    expect((await search("WEB-1")).some((r) => r.type === "task")).toBe(false);
    await client.command("project.archive", { id: projectId });
    expect(await search("WEB-1")).toEqual([]);
  });
  it("includes resolved Topic destinations, isolates Workspaces and validates input", async () => {
    const client = await connect(freshWorkspaceId(), newMember()), other = await connect(freshWorkspaceId(), newMember());
    const projectId = uuidv7(), topicId = uuidv7(), meetingId = uuidv7();
    await client.command("project.create", { id: projectId, key: "APP", name: "App" });
    await client.command("topic.create", { id: topicId, projectId, title: "Searchable Topic" });
    await client.command("meeting.start", { id: meetingId, projectId });
    await client.command("meeting.recordOutcome", { topicId, outcome: "Agreed" });
    await client.command("meeting.close", { id: meetingId });
    const page = (await client.query("search", { text: "Searchable" })).data as { items: SearchResult[] };
    expect(page.items[0]).toMatchObject({ type: "topic", projectKey: "APP", meetingId });
    expect((await other.query("search", { text: "Searchable" })).data).toEqual({ items: [] });
    for (const args of [{ text: " " }, { text: "a".repeat(201) }, { text: "x", limit: 51 }, { text: "x", projectId: "" }]) {
      const id = uuidv7();
      client.ws.send(JSON.stringify({ type: "query", id, name: "search", args }));
      expect((await client.next("result_error", (m) => m.id === id)).error.code).toBe("invalid");
    }
  });
});
