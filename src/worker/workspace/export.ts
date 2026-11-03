/** Application tables only; SQLite/runtime internal tables are not portable app data. */
export function exportWorkspace(sql: SqlStorage) {
  const names = sql.exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").toArray()
    .map((r) => r.name).filter((name) => !name.startsWith("sqlite_") && !name.startsWith("__"));
  const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
  const tables: Record<string, Record<string, SqlStorageValue>[]> = {};
  for (const name of names) {
    const columns = sql.exec<{ name: string }>(`PRAGMA table_info(${quote(name)})`).toArray()
      .map((c) => c.name).filter((column) => column !== "github_token_enc");
    tables[name] = sql.exec(`SELECT ${columns.map(quote).join(", ")} FROM ${quote(name)}`).toArray();
  }
  const schemaVersion = sql.exec<{ version: number }>("SELECT version FROM _schema").toArray()[0]?.version ?? 0;
  return { format: "pm.workspace", formatVersion: 1, schemaVersion, exportedAt: Date.now(), tables };
}
