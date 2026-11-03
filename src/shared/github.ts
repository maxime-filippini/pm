import { z } from "zod";
export const PullRequestUrl = z.string().trim().regex(
  /^https:\/\/github\.com\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9_.-]+\/pull\/[1-9]\d{0,9}$/,
  "Use https://github.com/owner/repo/pull/number",
).refine((url) => ![".", ".."].includes(url.split("/")[4]!), "Invalid repository");
export function parsePullRequestUrl(url: string) {
  const parsed = PullRequestUrl.parse(url), parts = parsed.split("/");
  return { url: parsed, owner: parts[3]!, repo: parts[4]!, number: Number(parts[6]!) };
}
