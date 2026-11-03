import { Hono } from "hono";
import { authenticate, isAdmin } from "./auth";
import { memberByEmail, workspaceForMember, workspacesForMember, type RegistryMember } from "./registry";
import { MEMBER_HEADER } from "./workspace";

export { WorkspaceDO } from "./workspace";

type AppEnv = {
  Bindings: Env;
  Variables: { email: string; member: RegistryMember | null };
};

const app = new Hono<AppEnv>().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

// Every other /api route requires a valid Access identity.
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

app.get("/w/:slug/ws", async (c) => {
  const member = c.get("member");
  if (!member) return c.json({ error: "Not invited" }, 403);
  if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") {
    return c.json({ error: "Expected WebSocket" }, 426);
  }
  const workspace = await workspaceForMember(c.env.DB, c.req.param("slug"), member.id);
  if (!workspace) return c.json({ error: "Not a member of this workspace" }, 403);

  const headers = new Headers(c.req.raw.headers);
  headers.set(MEMBER_HEADER, member.id);
  const stub = c.env.WORKSPACE.getByName(workspace.id);
  return stub.fetch(new Request(c.req.raw, { headers }));
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

export default app satisfies ExportedHandler<Env>;
