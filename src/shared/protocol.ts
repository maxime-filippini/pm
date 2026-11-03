import { z } from "zod";
import type { Activity, Change, Feature, Member, Project, Task } from "./entities";
import { Id } from "./entities";

// ---- Client → server ----

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cmd"), id: Id, name: z.string(), args: z.unknown() }),
  z.object({ type: z.literal("query"), id: Id, name: z.string(), args: z.unknown() }),
  z.object({
    type: z.literal("presence"),
    viewing: z.object({ type: z.string(), id: Id }).nullish(),
    editing: z.object({ ref: z.object({ type: z.string(), id: Id }), field: z.string() }).nullish(),
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const querySchemas = {
  "activity.list": z.object({ before: z.number().int().optional(), limit: z.number().int().min(1).max(200).default(50) }),
} as const;
export type QueryName = keyof typeof querySchemas;

// ---- Server → client ----

export type Snapshot = {
  members: Member[];
  projects: Project[];
  features: Feature[];
  tasks: Task[];
};

export type ErrorCode = "invalid" | "not_found" | "conflict" | "forbidden" | "internal";

export type ServerMessage =
  | { type: "snapshot"; version: number; memberId: string; data: Snapshot }
  | { type: "change"; version: number; cause?: string; changes: Change[] }
  | { type: "ack"; id: string }
  | { type: "reject"; id: string; error: { code: ErrorCode; message: string } }
  | { type: "result"; id: string; data: unknown }
  | { type: "result_error"; id: string; error: { code: ErrorCode; message: string } };

export type ActivityPage = { items: Activity[] };
