export type RegistryMember = { id: string; email: string; name: string };
export type RegistryWorkspace = { id: string; slug: string; name: string };

export async function memberByEmail(db: D1Database, email: string) {
  return db
    .prepare("SELECT id, email, name FROM members WHERE email = ?")
    .bind(email)
    .first<RegistryMember>();
}

export async function workspacesForMember(db: D1Database, memberId: string) {
  const { results } = await db
    .prepare(
      `SELECT w.id, w.slug, w.name FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE wm.member_id = ? ORDER BY w.name`,
    )
    .bind(memberId)
    .all<RegistryWorkspace>();
  return results;
}

export async function workspaceForMember(db: D1Database, slug: string, memberId: string) {
  return db
    .prepare(
      `SELECT w.id, w.slug, w.name FROM workspaces w
       JOIN workspace_members wm ON wm.workspace_id = w.id
       WHERE w.slug = ? AND wm.member_id = ?`,
    )
    .bind(slug, memberId)
    .first<RegistryWorkspace>();
}
