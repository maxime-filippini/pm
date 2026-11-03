import { createExecutionContext, env, SELF, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../src/worker/index";
import { commandSchemas } from "../src/shared/commands";
import { querySchemas } from "../src/shared/protocol";
import { uuidv7 } from "../src/shared/ids";
import { connect, workspaceStub } from "./helpers";
import { handleMcp } from "../src/worker/mcp";

const ADMIN = "maxime.filippini@gmail.com";
const MEMBER = "mcp-member@example.com";
async function call(path: string, email = MEMBER, init?: RequestInit) {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(`https://pm.test${path}`, init), { ...env, DEV_ACCESS_EMAIL: email, ACCESS_AUD: "" }, ctx);
  await waitOnExecutionContext(ctx);
  return response;
}
const endpoint = "/api/w/mcp-team/mcp?client=Claude";
async function rpc(method: string, params: unknown = {}, email = MEMBER, path = endpoint, headers = {}) {
  return call(path, email, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25", ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
}
async function tool(name: string, args = {}) {
  const response = await rpc("tools/call", { name, arguments: args });
  expect(response.status).toBe(200);
  const body = await response.json() as { result: { content: Array<{ text: string }>; isError?: boolean } };
  return { error: body.result.isError, data: JSON.parse(body.result.content[0]!.text) };
}

describe("MCP over Streamable HTTP", () => {
  let workspaceId: string;
  let member: { id: string; email: string; name: string };
  const projectId = uuidv7();
  beforeAll(async () => {
    const created = await call("/api/admin/workspaces", ADMIN, { method: "POST", body: JSON.stringify({ slug: "mcp-team", name: "MCP Team" }) });
    workspaceId = ((await created.json()) as { workspace: { id: string } }).workspace.id;
    const invited = await call(`/api/admin/workspaces/${workspaceId}/members`, ADMIN, { method: "POST", body: JSON.stringify({ email: MEMBER, name: "MCP Member" }) });
    member = ((await invited.json()) as { member: typeof member }).member;
  });

  it("initializes without an in-memory session and discovers the shared command/query schemas", async () => {
    const response = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "Claude", version: "1" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Mcp-Session-Id")).toBeNull();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ result: { serverInfo: { name: "pm" }, capabilities: { tools: {} } } });
    const notification = await call(endpoint, MEMBER, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
    expect(notification.status).toBe(202);
    const listed = await rpc("tools/list");
    const body = await listed.json() as { result: { tools: Array<{ name: string; inputSchema: { type: string }; annotations: { readOnlyHint: boolean } }> } };
    expect(body.result.tools.map(t => t.name).sort()).toEqual([...Object.keys(commandSchemas), ...Object.keys(querySchemas), "workspace.snapshot", "ids.generate"].sort());
    expect(body.result.tools.every(t => t.inputSchema.type === "object")).toBe(true);
    expect(body.result.tools.find(t => t.name === "search")?.annotations.readOnlyHint).toBe(true);
    expect(body.result.tools.find(t => t.name === "task.delete")?.annotations.readOnlyHint).toBe(false);
  });

  it("runs commands as the Access Member, broadcasts changes, and reads shared queries", async () => {
    const browser = await connect(workspaceId, member);
    try {
      const project = await tool("project.create", { id: projectId, key: "MCP", name: "Agent work" });
      expect(project.error).toBe(false);
      expect(await browser.next("change", m => m.changes.some(c => c.entity === "project"))).toMatchObject({ version: project.data.version });
      const generated = await tool("ids.generate");
      const taskId = generated.data.id;
      expect(taskId).toMatch(/^[0-9a-f-]{36}$/);
      expect((await tool("task.create", { id: taskId, projectId, title: "Agent task" })).error).toBe(false);
      expect((await tool("task.update", { id: taskId, title: "Updated agent task" })).error).toBe(false);
      const commentId = uuidv7();
      expect((await tool("comment.create", { id: commentId, target: { type: "task", id: taskId }, body: "Agent comment" })).error).toBe(false);
      expect((await tool("comments.list", { target: { type: "task", id: taskId } })).data.items).toContainEqual(expect.objectContaining({ id: commentId, body: "Agent comment" }));
      expect((await tool("search", { text: "Updated agent" })).data.items).toContainEqual(expect.objectContaining({ id: taskId }));
      const snap = await tool("workspace.snapshot");
      expect(snap.data.memberId).toBe(member.id);
      expect(snap.data.data.tasks).toContainEqual(expect.objectContaining({ id: taskId, title: "Updated agent task", createdBy: member.id }));
      const activity = await tool("activity.list");
      expect(activity.data.items.length).toBeGreaterThan(0);
      expect(activity.data.items.every((a: { actorId: string; via: string }) => a.actorId === member.id && a.via === "Claude")).toBe(true);
      expect((await tool("task.delete", { id: taskId })).error).toBe(false);
      expect((await tool("workspace.snapshot")).data.data.tasks.some((t: { id: string }) => t.id === taskId)).toBe(false);
      expect((await tool("task.restore", { id: taskId })).error).toBe(false);
    } finally { browser.close(); }
  });

  it("returns validation and domain errors as tool errors", async () => {
    expect(await tool("task.create", { title: "Missing IDs" })).toMatchObject({ error: true, data: { code: "invalid" } });
    expect(await tool("task.setStatus", { id: "missing", status: "done" })).toMatchObject({ error: true, data: { code: "not_found" } });
    expect(await tool("constructor")).toMatchObject({ error: true, data: { code: "invalid" } });
    expect(await tool("activity.list", { before: 1, cursor: { at: 1, id: "x" } })).toMatchObject({ error: true, data: { code: "invalid" } });
  });

  it("checks Access, invitation and Workspace membership on every request", async () => {
    expect((await SELF.fetch(`https://pm.test${endpoint}`, { method: "POST" })).status).toBe(401);
    expect((await rpc("tools/list", {}, "stranger@example.com")).status).toBe(403);
    expect((await rpc("tools/list", {}, MEMBER, "/api/w/another-team/mcp")).status).toBe(403);
    expect((await rpc("tools/list", {}, "stranger@example.com", endpoint, { "X-PM-Member-Id": member.id })).status).toBe(403);
  });

  it("rejects cross-origin requests, bad labels, malformed JSON and unsupported methods", async () => {
    expect((await rpc("tools/list", {}, MEMBER, endpoint, { Origin: "https://evil.test" })).status).toBe(403);
    expect((await rpc("tools/list", {}, MEMBER, "/api/w/mcp-team/mcp?client=%0A")).status).toBe(400);
    expect((await call(endpoint)).status).toBe(405);
    expect((await rpc("tools/list", {}, MEMBER, endpoint, { Origin: "https://pm.test" })).status).toBe(200);
    const malformed = await call(endpoint, MEMBER, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "{" });
    expect(malformed.status).toBe(400);
  });

  it("never returns configured GitHub tokens in snapshots or Activity", async () => {
    const token = "public-mcp-test-fixture";
    expect((await tool("project.setGithubToken", { id: projectId, token })).error).toBe(false);
    for (const name of ["workspace.snapshot", "activity.list"]) {
      const read = await tool(name);
      expect(JSON.stringify(read)).not.toContain(token);
      expect(JSON.stringify(read)).not.toContain("github_token_enc");
    }
  });

  it("denies removed Members even after a previous successful MCP request", async () => {
    expect((await rpc("tools/list")).status).toBe(200);
    await call(`/api/admin/workspaces/${workspaceId}/members/${member.id}`, ADMIN, { method: "DELETE" });
    expect((await rpc("tools/list")).status).toBe(403);
    // Simulate a request whose registry check completed before the removal.
    const delayed = await handleMcp(new Request(`https://pm.test${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "project.rename", arguments: { id: projectId, name: "Unauthorized" } } }) }), workspaceStub(workspaceId), member);
    const denied = await delayed.json() as { result: { isError: boolean; content: Array<{ text: string }> } };
    expect(denied.result.isError).toBe(true);
    expect(JSON.parse(denied.result.content[0]!.text)).toMatchObject({ code: "forbidden" });
    expect((await workspaceStub(workspaceId).query(member.id, "workspace.snapshot", {}))).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });
});
