// Set only in production (passed by the deploy script), or in local dev via .dev.vars.
declare namespace Cloudflare {
  interface Env {
    ACCESS_TEAM_DOMAIN?: string;
    ACCESS_AUD?: string;
  }
}
