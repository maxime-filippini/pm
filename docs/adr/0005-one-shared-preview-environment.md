# One shared preview environment for feature branches

Every push to a branch other than `master` deploys to a separate Worker, `pm-preview`, on `pm-preview.maximefilippini.me`. It has its own D1 database (`pm-registry-preview`) and its own Durable Objects, so a preview can never read or write production data. There is one preview, not one per branch: the latest push wins. The preview hostname must be added to the same Access application as production so the login and `ACCESS_AUD` are the same. This is the intended configuration; its manual setup is still unverified in `docs/tasks.md`. Production deploys only from `master`.

## Considered Options

- **Cloudflare preview URLs** (`wrangler versions upload --preview-alias`): rejected. Preview versions share the production bindings, so a branch would run against production D1 and Durable Objects (and preview versions can't carry Durable Object migrations). They also live on `workers.dev`, outside our Access app, which ADR 0003 rules out.
- **One Worker per branch**: rejected for now. Isolated data per branch, but it needs a wildcard Access app, a D1 database per branch, and cleanup when branches are deleted. Not worth it for a handful of people working on a few branches at a time.

## Consequences

Two branches pushed close together overwrite each other's preview; re-run the branch's CI job to put it back. Preview data is disposable: admins seed it through `/admin` on the preview host. D1 migrations run against the preview database before they reach production.
