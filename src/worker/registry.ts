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

export type AdminWorkspace = RegistryWorkspace & { members: Array<RegistryMember & { addedAt: number }> };

export async function listWorkspacesWithMembers(db: D1Database): Promise<AdminWorkspace[]> {
  const [{ results: workspaces }, { results: rows }] = await db.batch([
    db.prepare("SELECT id, slug, name FROM workspaces ORDER BY name"),
    db.prepare(
      `SELECT wm.workspace_id, m.id, m.email, m.name, wm.added_at FROM workspace_members wm
       JOIN members m ON m.id = wm.member_id ORDER BY m.name`,
    ),
  ]) as [D1Result<RegistryWorkspace>, D1Result<RegistryMember & { workspace_id: string; added_at: number }>];
  return workspaces.map((w) => ({
    ...w,
    members: rows
      .filter((r) => r.workspace_id === w.id)
      .map((r) => ({ id: r.id, email: r.email, name: r.name, addedAt: r.added_at })),
  }));
}

export async function workspaceById(db: D1Database, id: string) {
  return db.prepare("SELECT id, slug, name FROM workspaces WHERE id = ?").bind(id).first<RegistryWorkspace>();
}

export async function createWorkspace(db: D1Database, ws: RegistryWorkspace, now: number) {
  await db.prepare("INSERT INTO workspaces (id, slug, name, created_at) VALUES (?, ?, ?, ?)").bind(ws.id, ws.slug, ws.name, now).run();
}

/** Find or create the Member for this email, then add them to the Workspace. */
export async function addMember(db: D1Database, workspaceId: string, member: RegistryMember, now: number): Promise<RegistryMember> {
  await db
    .prepare("INSERT INTO members (id, email, name, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING")
    .bind(member.id, member.email, member.name, now)
    .run();
  const saved = (await memberByEmail(db, member.email))!;
  await db
    .prepare("INSERT INTO workspace_members (workspace_id, member_id, added_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
    .bind(workspaceId, saved.id, now)
    .run();
  return saved;
}

export async function removeMember(db: D1Database, workspaceId: string, memberId: string) {
  await db.prepare("DELETE FROM workspace_members WHERE workspace_id = ? AND member_id = ?").bind(workspaceId, memberId).run();
}

export async function renameMember(db: D1Database, memberId: string, name: string) {
  await db.prepare("UPDATE members SET name = ? WHERE id = ?").bind(name, memberId).run();
  const member = await db.prepare("SELECT id, email, name FROM members WHERE id = ?").bind(memberId).first<RegistryMember>();
  return member ? { member, workspaces: await workspacesForMember(db, memberId) } : null;
}
