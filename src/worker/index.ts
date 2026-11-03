import { handleMcp } from "./mcp";
import { Hono } from "hono";
import { z } from "zod";
import { uuidv7 } from "../shared/ids";
import { authenticate, isAdmin } from "./auth";
import {
  addMember,
  createWorkspace,
  listWorkspacesWithMembers,
  memberByEmail,
  removeMember,
  renameMember,
  workspaceById,
  workspaceForMember,
  workspacesForMember,
  type RegistryMember,
} from "./registry";
import { MEMBER_HEADERS } from "./workspace";

export { WorkspaceDO } from "./workspace";

type AppEnv = {
  Bindings: Env;
  Variables: { email: string; member: RegistryMember | null };
};

const app = new Hono<AppEnv>().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

// Every other /api route requires a valid Access identity (spec §3).
app.use("*", async (c, next) => {
  const auth = await authenticate(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.message }, auth.status);
  c.set("email", auth.email);
  c.set("member", await memberByEmail(c.env.DB, auth.email));
  await next();
});

app.get("/me", async (c) => {
  const email = c.get("email");
  const member = c.get("member");
  const workspaces = member ? await workspacesForMember(c.env.DB, member.id) : [];
  return c.json({ email, member, workspaces, isAdmin: isAdmin(c.env, email) });
});

// A download is scoped through the same registry membership check as sockets.
app.get("/w/:slug/export", async (c) => {
  const member = c.get("member");
  if (!member) return c.json({ error: "Not invited" }, 403);
  const workspace = await workspaceForMember(c.env.DB, c.req.param("slug"), member.id);
  if (!workspace) return c.json({ error: "Not a member of this Workspace" }, 403);
  const data = await c.env.WORKSPACE.getByName(workspace.id).exportData();
  c.header("Cache-Control", "no-store");
  c.header("Content-Disposition", `attachment; filename="pm-${workspace.slug}-${new Date(data.exportedAt).toISOString().slice(0, 10)}.json"`);
  return c.json({ ...data, workspace: { id: workspace.id, slug: workspace.slug, name: workspace.name } });
});

// Each MCP request resolves identity and registry membership anew, including tools/list.
app.all("/w/:slug/mcp", async (c) => {
  const member = c.get("member");
  if (!member) return c.json({ error: "Not invited" }, 403);
  const workspace = await workspaceForMember(c.env.DB, c.req.param("slug"), member.id);
  if (!workspace) return c.json({ error: "Not a member of this Workspace" }, 403);
  return handleMcp(c.req.raw, c.env.WORKSPACE.getByName(workspace.id), member);
});

// ---- Workspace socket ----

app.get("/w/:slug/ws", async (c) => {
  const member = c.get("member");
  if (!member) return c.json({ error: "Not invited" }, 403);
  const workspace = await workspaceForMember(c.env.DB, c.req.param("slug"), member.id);
  if (!workspace) return c.json({ error: "Not a member of this Workspace" }, 403);
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return c.json({ error: "Expected WebSocket" }, 426);
  }

  // Overwrite (never trust) identity headers before forwarding.
  const headers = new Headers(c.req.raw.headers);
  headers.set(MEMBER_HEADERS.id, member.id);
  headers.set(MEMBER_HEADERS.email, member.email);
  headers.set(MEMBER_HEADERS.name, encodeURIComponent(member.name));
  return c.env.WORKSPACE.getByName(workspace.id).fetch(new Request(c.req.raw, { headers }));
});

// ---- Admin (ADMIN_EMAILS only) ----

const admin = new Hono<AppEnv>();

admin.use("*", async (c, next) => {
  if (!isAdmin(c.env, c.get("email"))) return c.json({ error: "Admins only" }, 403);
  await next();
});

admin.get("/workspaces", async (c) => c.json({ workspaces: await listWorkspacesWithMembers(c.env.DB) }));

const WorkspaceInput = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,31}$/, "Slug: 2–32 lowercase letters, digits or dashes"),
  name: z.string().trim().min(1).max(100),
});

admin.post("/workspaces", async (c) => {
  const input = WorkspaceInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: input.error.issues[0]?.message ?? "Invalid input" }, 400);
  const workspace = { id: uuidv7(), ...input.data };
  try {
    await createWorkspace(c.env.DB, workspace, Date.now());
  } catch {
    return c.json({ error: "That slug is already used" }, 409);
  }
  return c.json({ workspace }, 201);
});

const MemberInput = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(1).max(100),
});

admin.post("/workspaces/:id/members", async (c) => {
  const workspace = await workspaceById(c.env.DB, c.req.param("id"));
  if (!workspace) return c.json({ error: "Workspace not found" }, 404);
  const input = MemberInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: input.error.issues[0]?.message ?? "Invalid input" }, 400);
  const member = await addMember(c.env.DB, workspace.id, { id: uuidv7(), ...input.data }, Date.now());
  await c.env.WORKSPACE.getByName(workspace.id).upsertMember(member);
  return c.json({ member }, 201);
});

admin.delete("/workspaces/:id/members/:memberId", async (c) => {
  const workspace = await workspaceById(c.env.DB, c.req.param("id"));
  if (!workspace) return c.json({ error: "Workspace not found" }, 404);
  await removeMember(c.env.DB, workspace.id, c.req.param("memberId"));
  await c.env.WORKSPACE.getByName(workspace.id).deactivateMember(c.req.param("memberId"));
  return c.body(null, 204);
});

admin.patch("/members/:memberId", async (c) => {
  const input = MemberInput.pick({ name: true }).safeParse(await c.req.json().catch(() => null));
  if (!input.success) return c.json({ error: input.error.issues[0]?.message ?? "Invalid input" }, 400);
  const result = await renameMember(c.env.DB, c.req.param("memberId"), input.data.name);
  if (!result) return c.json({ error: "Member not found" }, 404);
  await Promise.all(result.workspaces.map((w) => c.env.WORKSPACE.getByName(w.id).upsertMember(result.member)));
  return c.json({ member: result.member });
});

app.route("/admin", admin);

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app satisfies ExportedHandler<Env>;
