import { z } from "zod";
import { Id, ProjectKey, Rank, TaskStatus, FeatureStatus } from "./entities";

const Title = z.string().trim().min(1, "Title is required").max(200);
const Name = z.string().trim().min(1, "Name is required").max(100);
const Description = z.string().max(20_000);
const Outcome = z.string().trim().min(1, "Outcome is required").max(5_000);
const TopicRef = z.object({ type: z.literal("task"), id: Id }).nullable();

/** Every command the Workspace DO accepts (spec §6). The same set will back the API and MCP server. */
export const commandSchemas = {
  "project.create": z.object({ id: Id, key: ProjectKey, name: Name }),
  "project.rename": z.object({ id: Id, name: Name }),
  "project.archive": z.object({ id: Id }),
  "project.unarchive": z.object({ id: Id }),
  "feature.create": z.object({ id: Id, projectId: Id, title: Title, description: Description.optional() }),
  "feature.update": z.object({ id: Id, title: Title.optional(), description: Description.optional() }),
  "feature.setStatus": z.object({ id: Id, status: FeatureStatus }),
  "meeting.createFeature": z.object({ topicId: Id, featureId: Id, title: Title, description: Description.optional() }),
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
  /** Soft delete: hidden everywhere, number not reused, restorable. */
  "task.delete": z.object({ id: Id }),
  "task.restore": z.object({ id: Id }),
  "topic.create": z.object({ id: Id, projectId: Id, title: Title, body: Description.optional(), ref: TopicRef.optional() }),
  "topic.update": z.object({ id: Id, title: Title.optional(), body: Description.optional(), ref: TopicRef.optional() }),
  "topic.move": z.object({ id: Id, rank: Rank }),
  "topic.delete": z.object({ id: Id }),
  "meeting.start": z.object({ id: Id, projectId: Id }),
  "meeting.setAttendees": z.object({ id: Id, memberIds: z.array(Id).max(200) }),
  "meeting.recordOutcome": z.object({ topicId: Id, outcome: Outcome }),
  "meeting.clearOutcome": z.object({ topicId: Id }),
  /** Create a Task from a Topic during the open Meeting and note it in the Topic's Outcome. */
  "meeting.createTask": z.object({ topicId: Id, taskId: Id, title: Title, assigneeId: Id.nullish() }),
  "meeting.close": z.object({ id: Id }),
  /** Soft delete. Topics resolved in it go back on the agenda; restore puts their Outcomes back. */
  "meeting.delete": z.object({ id: Id }),
  "meeting.restore": z.object({ id: Id }),
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
