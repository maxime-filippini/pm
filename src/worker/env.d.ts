// Not in wrangler.jsonc: passed only by the deploy script, so `wrangler types` can't see them.
interface __BaseEnv_Env {
  GITHUB_TOKEN_KEY?: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
}
