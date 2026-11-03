import { z } from "zod";
import type { PullRequestLink } from "../../shared/entities";
const GitHubPull = z.object({ title: z.string(), state: z.enum(["open", "closed"]), draft: z.boolean().optional(), merged_at: z.string().nullable().optional() });
export type PullFetch = Pick<PullRequestLink, "title" | "state" | "fetchError">;
/** Bounded I/O only; callers persist the result after checking current token/link identity. */
export async function fetchPullRequest(link: Pick<PullRequestLink, "owner" | "repo" | "number">, token: string | null, fetcher: typeof fetch = fetch): Promise<PullFetch> {
  if (!token) return { title: null, state: null, fetchError: "no_token" };
  try {
    const response = await fetcher(`https://api.github.com/repos/${link.owner}/${link.repo}/pulls/${link.number}`, {
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "pm", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(5_000), redirect: "error",
    });
    if (!response.ok) {
      await response.body?.cancel();
      return { title: null, state: null, fetchError: response.status === 401 || response.status === 403 ? "unauthorized" : response.status === 404 ? "not_found" : "unavailable" };
    }
    const body = GitHubPull.parse(await response.json());
    return { title: body.title, state: body.merged_at ? "merged" : body.state === "closed" ? "closed" : body.draft ? "draft" : "open", fetchError: null };
  } catch { return { title: null, state: null, fetchError: "unavailable" }; }
}
