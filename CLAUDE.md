# pm

Small multiplayer project-management app on Cloudflare Workers. Read [`CONTEXT.md`](CONTEXT.md) for domain terms, [`docs/spec.md`](docs/spec.md) for the v1 spec, [`docs/adr/`](docs/adr/) for decisions, and [`docs/tasks.md`](docs/tasks.md) for progress.

For remaining v1 implementation or a handoff, start with [`docs/handoff.md`](docs/handoff.md) for the execution order, acceptance checks, and branch/PR baseline.

## Conventions

- Never commit to `master`: pushes to it deploy to production. Work on a branch and open a PR.
- Branch names: `<type>/<short-kebab-name>`, e.g. `feat/meetings`, `fix/task-rank`, `ci/preview-deployments`.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<optional scope>): <summary>`, e.g. `feat(sync): add presence`.
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- CI enforces both (`scripts/check-conventions.sh`); run `pnpm check:conventions` before pushing.

## Deploys

- Any branch except `master` → shared preview `pm-preview.maximefilippini.me` (ADR 0005).
- `master` → production `pm.maximefilippini.me`.
- `pnpm run deploy` / `pnpm run deploy:preview` do the same by hand: D1 migrations, build, deploy.

## Commands

- `pnpm dev`: local app with `DEV_ACCESS_EMAIL` from `.dev.vars` (copy `.dev.vars.example`). Run `pnpm db:migrate:local` first.
- `pnpm typecheck`, `pnpm test`.
- Durable Object rules in ADR 0002 are tested; keep timers out of `src/worker/workspace/`.
