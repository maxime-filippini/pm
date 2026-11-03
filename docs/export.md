# Workspace export format

Any active Workspace Member can download `GET /api/w/:slug/export` from **Projects → Workspace data → Export Workspace**. Cloudflare Access authentication and registry membership are required. Responses are attachments with `Cache-Control: no-store`.

Format version 1:

- `format`: `pm.workspace`
- `formatVersion`: `1` (the JSON envelope version)
- `schemaVersion`: current Workspace migration number
- `exportedAt`: epoch milliseconds
- `workspace`: registry identity (`id`, `slug`, `name`)
- `tables`: an object keyed by original SQL table name; each value is an array of rows with original SQL column names

All application tables are included, including `_schema`, `meta`, retained deleted Tasks/Meetings, Comments, Activity, and Meeting attendees. SQLite/runtime internal tables are excluded. The `github_token_enc` column is omitted entirely, including from future tables should that column occur there. GitHub credentials are never part of an export.

This is an online data export, not an import or restore feature. Preserve the format and schema versions when archiving files. Operational disaster recovery uses Cloudflare Durable Object point-in-time recovery.

# Installation

The manifest uses `display: standalone`, with 192 px and 512 px PNG icons and an Apple touch icon. Icons can be regenerated with `python3 scripts/generate-icons.py`. There is no service worker, offline cache or offline editing. Installation availability depends on the browser; real-device installation remains a manual verification.
