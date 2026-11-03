import { z } from "zod";
import { Id, ProjectKey, Rank, TaskStatus } from "./entities";

const Title = z.string().trim().min(1, "Title is required").max(200);
const Name = z.string().trim().min(1, "Name is required").max(100);
const Description = z.string().max(20_000);

/** Every command the Workspace DO accepts (spec §6). The same set will back the API and MCP server. */
export const commandSchemas = {
  "project.create": z.object({ id: Id, key: ProjectKey, name: Name }),
  "project.rename": z.object({ id: Id, name: Name }),
  "project.archive": z.object({ id: Id }),
  "project.unarchive": z.object({ id: Id }),
  "task.create": z.object({
    id: Id,
    projectId: Id,
    title: Title,
    description: Description.optional(),
    featureId: Id.nullish(),
    assigneeId: Id.nullish(),
    status: TaskStatus.optional(),
    rank: Rank.optional(),
  }),
  "task.update": z.object({
    id: Id,
    title: Title.optional(),
    description: Description.optional(),
    featureId: Id.nullable().optional(),
    assigneeId: Id.nullable().optional(),
  }),
  "task.setStatus": z.object({ id: Id, status: TaskStatus }),
  "task.move": z.object({ id: Id, rank: Rank }),
} as const;

export type CommandName = keyof typeof commandSchemas;
export type CommandArgs<N extends CommandName> = z.infer<(typeof commandSchemas)[N]>;
export type Command = { [N in CommandName]: { name: N; args: CommandArgs<N> } }[CommandName];

export const COMMAND_NAMES = Object.keys(commandSchemas) as CommandName[];

export function parseCommand(name: string, args: unknown): { ok: true; command: Command } | { ok: false; message: string } {
  if (!(name in commandSchemas)) return { ok: false, message: `Unknown command: ${name}` };
  const result = commandSchemas[name as CommandName].safeParse(args);
  if (!result.success) return { ok: false, message: result.error.issues.map((i) => i.message).join("; ") };
  return { ok: true, command: { name, args: result.data } as Command };
}
