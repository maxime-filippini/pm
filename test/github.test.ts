import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPullRequest } from "../src/worker/workspace/github";
import { decryptToken, encryptToken } from "../src/worker/workspace/crypto";
import { connect, freshWorkspaceId, newMember, workspaceStub } from "./helpers";
import { uuidv7 } from "../src/shared/ids";
import type { PullRequestLink } from "../src/shared/entities";
afterEach(() => vi.restoreAllMocks());
const link = { owner: "owner", repo: "repo", number: 12 };
describe("GitHub state and error mapping", () => {
  it("maps merged/closed/draft/open, sends required headers, and bounds requests to 5 seconds", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    for (const [body, state] of [
      [{ state: "open", draft: true, merged_at: "today" }, "merged"],
      [{ state: "closed", draft: true }, "closed"],
      [{ state: "open", draft: true }, "draft"],
      [{ state: "open", draft: false }, "open"],
    ] as const) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ title: "PR title", ...body }));
      expect(await fetchPullRequest(link, "test-fixture", fetcher)).toMatchObject({ state, fetchError: null });
      expect(fetcher).toHaveBeenCalledWith("https://api.github.com/repos/owner/repo/pulls/12", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-fixture", "User-Agent": "pm" }), redirect: "error", signal: expect.any(AbortSignal) }));
    }
    expect(timeout).toHaveBeenCalledWith(5000);
  });
  it("maps no token, authorization, missing, malformed and unavailable responses", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect((await fetchPullRequest(link, null, fetcher)).fetchError).toBe("no_token");
    expect(fetcher).not.toHaveBeenCalled();
    for (const [status, error] of [[401, "unauthorized"], [403, "unauthorized"], [404, "not_found"], [503, "unavailable"]] as const) {
      fetcher.mockResolvedValueOnce(new Response("", { status }));
      expect((await fetchPullRequest(link, "fixture", fetcher)).fetchError).toBe(error);
    }
    fetcher.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(Response.json({ wrong: true }));
    expect((await fetchPullRequest(link, "fixture", fetcher)).fetchError).toBe("unavailable");
    expect((await fetchPullRequest(link, "fixture", fetcher)).fetchError).toBe("unavailable");
  });
  it("encrypts with unique IVs, authenticates ciphertext and requires a configured key", async () => {
    const a = await encryptToken("test-token-fixture", env.GITHUB_TOKEN_KEY);
    expect(a).not.toContain("test-token-fixture");
    expect(await encryptToken("test-token-fixture", env.GITHUB_TOKEN_KEY)).not.toBe(a);
    expect(await decryptToken(a, env.GITHUB_TOKEN_KEY)).toBe("test-token-fixture");
    const [version, iv, body] = a.split(".");
    await expect(decryptToken(version + "." + iv + "." + (body![0] === "A" ? "B" : "A") + body!.slice(1), env.GITHUB_TOKEN_KEY)).rejects.toThrow();
    await expect(encryptToken("fixture")).rejects.toThrow("not configured");
  });
});
async function setup() {
  const wsId = freshWorkspaceId(), member = newMember(), client = await connect(wsId, member);
  const projectId = uuidv7(), taskId = uuidv7(), prId = uuidv7();
  await client.command("project.create", { id: projectId, key: "WEB", name: "Web" });
  await client.command("task.create", { id: taskId, projectId, title: "Task" });
  const read = async () => (await connect(wsId, member)).snapshot.data;
  return { wsId, member, client, projectId, taskId, prId, read };
}
describe("GitHub commands", () => {
  it("keeps tokens write-only, validates links, respects freshness and leaves completion manual", async () => {
    const { wsId, client, projectId, taskId, prId, read } = await setup();
    const args = { id: prId, taskId, url: "https://github.com/owner/repo/pull/12" };
    expect((await client.command("pr.link", args)).ok).toBe(true);
    expect((await read()).pullRequestLinks[0]?.fetchError).toBe("no_token");
    const token = "private-test-token-fixture";
    expect((await client.command("project.setGithubToken", { id: projectId, token })).ok).toBe(true);
    const snapshot = await read();
    expect(snapshot.projects[0]?.hasGithubToken).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain(token);
    expect(snapshot.pullRequestLinks[0]?.fetchError).toBeNull();
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ title: "Merged work", state: "closed", merged_at: "today" }));
    expect((await client.command("pr.refresh", { taskId })).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect((await read()).pullRequestLinks[0]?.state).toBe("merged");
    expect((await read()).tasks[0]?.status).toBe("todo");
    await client.command("pr.refresh", { taskId });
    expect(fetcher).toHaveBeenCalledTimes(1);
    await runInDurableObject(workspaceStub(wsId), (_, state) => state.storage.sql.exec("UPDATE pull_request_links SET fetched_at = ? WHERE id = ?", Date.now() - 61_000, prId));
    await client.command("pr.refresh", { taskId });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await client.command("task.delete", { id: taskId });
    expect((await read()).pullRequestLinks).toHaveLength(0);
    const restored = await client.command("task.restore", { id: taskId });
    const restoration = await client.next("change", (m) => m.cause === restored.id);
    expect(restoration.changes.some((c) => c.entity === "pullRequestLink" && c.op === "upsert")).toBe(true);
    expect((await read()).pullRequestLinks).toHaveLength(1);
    const exported = await workspaceStub(wsId).exportData();
    expect(JSON.stringify(exported)).not.toContain(token);
    expect(JSON.stringify(exported)).not.toContain("github_token_enc");
    const activity = (await client.query("activity.list", {})).data;
    expect(JSON.stringify(activity)).not.toContain(token);
    for (const url of ["http://github.com/a/b/pull/1", "https://evil.test/a/b/pull/1", "https://github.com/a/b/issues/1", "https://github.com/a/../pull/1", "https://github.com/a/b/pull/0"]) expect((await client.command("pr.link", { ...args, id: uuidv7(), url })).ok).toBe(false);
    await client.command("pr.link", args);
    expect((await read()).pullRequestLinks).toHaveLength(1);
    await client.command("pr.unlink", { id: prId });
    await client.command("pr.unlink", { id: prId });
    expect((await read()).pullRequestLinks).toHaveLength(0);
  });
  it("discards a fetch result when the Project token changes while it is in flight", async () => {
    const { wsId, client, projectId, taskId, prId, read } = await setup();
    await client.command("pr.link", { id: prId, taskId, url: "https://github.com/owner/repo/pull/12" });
    await client.command("project.setGithubToken", { id: projectId, token: "old-test-fixture" });
    await runInDurableObject(workspaceStub(wsId), async (instance) => {
      let finish!: (r: Response) => void, started!: () => void;
      const start = new Promise<void>((r) => { started = r; });
      vi.spyOn(globalThis, "fetch").mockImplementation(() => { started(); return new Promise<Response>((r) => { finish = r; }); });
      const refreshing = instance.execute(client.snapshot.memberId, null, "pr.refresh", { taskId });
      await start;
      await instance.execute(client.snapshot.memberId, null, "project.setGithubToken", { id: projectId, token: null });
      finish(Response.json({ title: "Stale response", state: "closed", merged_at: "today" }));
      expect((await refreshing).ok).toBe(true);
    });
    expect((await read()).pullRequestLinks[0]?.state).not.toBe("merged");
    const encrypted = await runInDurableObject(workspaceStub(wsId), (_, state) => state.storage.sql.exec<{ github_token_enc: string | null }>("SELECT github_token_enc FROM projects WHERE id = ?", projectId).toArray()[0]?.github_token_enc);
    expect(encrypted).toBeNull();
  });
});
