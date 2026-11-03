# GitHub integration

Members paste a URL matching `https://github.com/owner/repo/pull/number` in a Task’s Pull Requests section. PM reads and caches the title and Draft/Open/Merged/Closed state. It never writes to GitHub. When every linked PR is merged, a Member can explicitly choose **Mark Done**; there is no automatic Task completion.

Opening a Task or choosing Refresh states fetches only links not fetched within the last 60 seconds. Each request has a 5-second timeout. A missing token does not make a request. Authorization failures, inaccessible PRs and temporary GitHub failures have separate messages; the previous cached state is retained on failure.

## Project token

Project settings accepts a fine-grained personal access token restricted to the Project’s repositories, with **Pull requests: read** and **Metadata: read**. One token covers one GitHub owner. Tokens are write-only, encrypted with AES-256-GCM and a random 96-bit IV. They are absent from snapshots, Activity payloads, exports and application logs.

The Worker needs the private `GITHUB_TOKEN_KEY` environment secret: a base64-encoded 32-byte AES key. Provision it separately for the preview and production Workers through the execution environment’s private secret mechanism before configuring Project tokens. Do not put its value in source, chat, CLI arguments or workflow YAML. No production or preview key/token was provisioned by this implementation. The Vitest key and token strings are public test fixtures only.

Do not replace an encryption key without a rotation plan: tokens encrypted with the previous key must be re-entered. Removing a Project token remains possible when encryption is unconfigured. Token changes clear cached fetch errors/timestamps so the next refresh uses current access.

Cryptography and GitHub requests run outside synchronous command transactions. Before persisting a response, the DO rechecks the link identity, Task visibility, captured fetch timestamp and encrypted Project token; stale in-flight responses cannot revive an unlinked/deleted item or overwrite data fetched with a new token.
