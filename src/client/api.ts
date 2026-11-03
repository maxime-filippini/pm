export type Me = {
  email: string;
  member: { id: string; email: string; name: string } | null;
  workspaces: Array<{ id: string; slug: string; name: string }>;
  isAdmin: boolean;
};

export async function fetchMe(): Promise<Me> {
  const res = await fetch("/api/me");
  if (!res.ok) throw new Error(`GET /api/me failed: ${res.status}`);
  return res.json();
}
