import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { commandSchemas } from "../shared/commands";
import { querySchemas } from "../shared/protocol";
import { uuidv7 } from "../shared/ids";
import { workspaceForMember, workspacesForMember, type RegistryMember } from "./registry";

const readSchemas = { "workspace.snapshot": z.object({}), ...querySchemas };
const accountSchemas = { "workspaces.list": z.object({}), "ids.generate": z.object({}) };
const WorkspaceSelection = z.object({
  workspaceSlug: z.string().min(2).max(32).regex(/^[a-z0-9][a-z0-9-]+$/)
    .describe("Workspace slug returned by workspaces.list. Always select the intended Workspace explicitly."),
});
const schemas: Record<string, z.ZodObject> = {
  ...Object.fromEntries(Object.entries({ ...commandSchemas, ...readSchemas }).map(([name, schema]) => [
    name, schema.safeExtend(WorkspaceSelection.shape),
  ])),
  ...accountSchemas,
};
const tools: Tool[] = Object.entries(schemas).map(([name, schema]) => ({
  name,
  description: name === "workspaces.list"
    ? "List all Workspaces the connected Member currently belongs to, with their IDs, names and slugs. Call this first."
    : name === "workspace.snapshot"
    ? "Read Members, Projects, Features, Tasks, Topics, Meetings and PR links. Comments and Activity are separate paginated tools."
    : name === "ids.generate" ? "Generate a UUIDv7 for a new entity. Generate IDs before calling creation tools."
    : name === "project.setGithubToken" ? "Set or clear the Project's write-only GitHub token. Never include tokens in other tools."
    : (Object.hasOwn(readSchemas, name) || Object.hasOwn(accountSchemas, name)) ? `Read ${name} using the same query as the app.`
    : `Run ${name} as the connected Member. Uses the app's validation and permissions; records Activity and synchronizes connected browsers.`,
  inputSchema: z.toJSONSchema(schema, { io: "input" }) as Tool["inputSchema"],
  annotations: {
    readOnlyHint: (Object.hasOwn(readSchemas, name) || Object.hasOwn(accountSchemas, name)),
    destructiveHint: !(Object.hasOwn(readSchemas, name) || Object.hasOwn(accountSchemas, name)),
    idempotentHint: (Object.hasOwn(readSchemas, name) || Object.hasOwn(accountSchemas, name)),
    openWorldHint: name.startsWith("pr.") || name === "project.setGithubToken",
  },
}));

function result(data: unknown, isError = false): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }], isError };
}

/** Per-request transport: no sessions or identity state are retained in the Worker. */
export async function handleMcp(request: Request, env: Env, member: RegistryMember): Promise<Response> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return Response.json({ error: "Origin is not allowed" }, { status: 403 });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });

  // A configured client label is attribution only. Identity always comes from Access.
  // Stateless requests cannot recover initialize.clientInfo from a previous request.
  const client = z.string().trim().min(1).max(100).regex(/^[\p{L}\p{N} ._/-]+$/u).safeParse(url.searchParams.get("client") ?? "MCP");
  if (!client.success) return Response.json({ error: "Invalid MCP client label" }, { status: 400 });

  const server = new Server({ name: "pm", version: "0.1.0" }, { capabilities: { tools: {} }, instructions: "Call workspaces.list first to discover accessible Workspaces. Pass workspaceSlug on every Workspace tool, then use workspace.snapshot to find entity IDs. Use ids.generate for new IDs. All tools act as the connected human Member. Never infer a different Workspace from an entity ID or reuse a global current Workspace. Task/Meeting deletion is soft and restorable. Do not retry creation blindly after a network error; inspect state first." });
  server.setRequestHandler(ListToolsRequestSchema, () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    const schema = Object.hasOwn(schemas, params.name) ? schemas[params.name] : undefined;
    if (!schema) return result({ code: "invalid", message: `Unknown tool: ${params.name}` }, true);
    const parsed = schema.safeParse(params.arguments ?? {});
    if (!parsed.success) return result({ code: "invalid", message: parsed.error.issues.map((issue) => issue.message).join("; ") }, true);
    // Admin invitation/removal maintains the DO mirror. Do not upsert here:
    // a slow request must not reactivate a Member removed after the registry check.
    if (params.name === "workspaces.list") return result({ workspaces: await workspacesForMember(env.DB, member.id) });
    if (params.name === "ids.generate") return result({ id: uuidv7() });
    const { workspaceSlug } = WorkspaceSelection.parse(parsed.data);
    const membership = await workspaceForMember(env.DB, workspaceSlug, member.id);
    if (!membership) return result({ code: "forbidden", message: "Not a member of this Workspace" }, true);
    const workspace = env.WORKSPACE.getByName(membership.id);
    const { workspaceSlug: _workspaceSlug, ...args } = parsed.data;
    if (Object.hasOwn(readSchemas, params.name)) {
      const response = await workspace.query(member.id, params.name, args);
      return response.ok ? result(JSON.parse(response.json)) : result(response.error, true);
    }
    const response = await workspace.command(member.id, client.data, params.name, args);
    return result(JSON.parse(response.json), !response.ok);
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 128 * 1024 });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } finally {
    await server.close();
  }
}
