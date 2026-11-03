# Cloudflare Access is the only authentication

The app has no login code. Cloudflare Access sits in front of the custom domain (an email allowlist, which is free for up to 50 users). The Worker still validates the `Cf-Access-Jwt-Assertion` JWT on every `/api`, WebSocket and MCP request and maps its email to a Member through the D1 registry. Static assets are covered by Access at the edge; the in-Worker check protects the data if a side door opens. `workers.dev` and preview URLs are disabled. For local development only, a `DEV_ACCESS_EMAIL` variable stands in for the JWT, and the Worker refuses to run with it set in production.

Agents will authenticate through Access **Managed OAuth** on the MCP endpoint, so they act as the human Member who connected them. If Claude's connector turns out not to work with Managed OAuth, the fallback is `workers-oauth-provider` with Access as the upstream sign-in. Access service tokens carry no email, so they are reserved for non-human automation.
