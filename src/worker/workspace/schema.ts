// Numbered SQL migrations for the Workspace DO. Append only; never edit a shipped entry.
export const migrations: string[] = [
  // 1: initial schema (spec §4)
  `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE members (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE projects (
    id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    next_task_number INTEGER NOT NULL DEFAULT 1, github_token_enc TEXT,
    archived_at INTEGER, created_at INTEGER NOT NULL, created_by TEXT NOT NULL
  );
  CREATE TABLE features (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('proposed','accepted','rejected','done')),
    decided_by TEXT, decided_at INTEGER,
    created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
  );
  CREATE TABLE tasks (
    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, number INTEGER NOT NULL, feature_id TEXT,
    title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('todo','in_progress','done','canceled')),
    assignee_id TEXT, rank TEXT NOT NULL,
    created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, completed_at INTEGER,
    UNIQUE(project_id, number)
  );
  CREATE TABLE comments (
    id TEXT PRIMARY KEY, target_type TEXT NOT NULL CHECK (target_type IN ('feature','task')), target_id TEXT NOT NULL,
    author_id TEXT NOT NULL, via TEXT, body TEXT NOT NULL, created_at INTEGER NOT NULL, edited_at INTEGER
  );
  CREATE INDEX comments_target ON comments(target_type, target_id);
  CREATE TABLE pull_request_links (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL, url TEXT NOT NULL, owner TEXT NOT NULL, repo TEXT NOT NULL, number INTEGER NOT NULL,
    title TEXT, state TEXT CHECK (state IN ('draft','open','merged','closed')),
    fetched_at INTEGER, fetch_error TEXT,
    created_by TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(task_id, url)
  );
  CREATE TABLE topics (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', ref_type TEXT, ref_id TEXT, rank TEXT NOT NULL,
    author_id TEXT NOT NULL, created_at INTEGER NOT NULL,
    outcome TEXT, resolved_in_meeting_id TEXT, resolved_at INTEGER
  );
  CREATE TABLE meetings (id TEXT PRIMARY KEY, started_at INTEGER NOT NULL, started_by TEXT NOT NULL, ended_at INTEGER, ended_by TEXT);
  CREATE TABLE meeting_attendees (meeting_id TEXT NOT NULL, member_id TEXT NOT NULL, PRIMARY KEY (meeting_id, member_id));
  CREATE TABLE activity (
    id TEXT PRIMARY KEY, at INTEGER NOT NULL, actor_id TEXT NOT NULL, via TEXT, kind TEXT NOT NULL,
    target_type TEXT NOT NULL, target_id TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}'
  );
  CREATE INDEX activity_at ON activity(at);
  CREATE INDEX activity_target ON activity(target_type, target_id);
  `,
  // 2: Topics and Meetings belong to a Project; at most one open Meeting per Project.
  `
  ALTER TABLE topics ADD COLUMN project_id TEXT;
  ALTER TABLE meetings ADD COLUMN project_id TEXT;
  CREATE INDEX topics_project ON topics(project_id, rank);
  CREATE UNIQUE INDEX meetings_one_open_per_project ON meetings(project_id) WHERE ended_at IS NULL;
  `,
];

export function migrate(sql: SqlStorage): void {
  sql.exec("CREATE TABLE IF NOT EXISTS _schema (version INTEGER NOT NULL)");
  const row = sql.exec<{ version: number }>("SELECT version FROM _schema").toArray()[0];
  let version = row?.version ?? 0;
  if (!row) sql.exec("INSERT INTO _schema (version) VALUES (0)");
  while (version < migrations.length) {
    sql.exec(migrations[version]!);
    version++;
    sql.exec("UPDATE _schema SET version = ?", version);
  }
}
