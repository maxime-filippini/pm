import { z } from "zod";
import type { Activity, PullRequestLink, Presence, ActivityItem, Comment, Change, Feature, Meeting, Member, Project, Task, Topic } from "./entities";
import { Id, Ref, CommentTarget, ActivityTarget } from "./entities";

// ---- Client → server ----

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("cmd"), id: Id, name: z.string(), args: z.unknown() }),
  z.object({ type: z.literal("query"), id: Id, name: z.string(), args: z.unknown() }),
  z.object({
    type: z.literal("presence"),
    viewing: Ref.nullish(),
    editing: z.object({ ref: Ref, field: z.string().min(1).max(100) }).nullish(),
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

export const querySchemas = {
  "search": z.object({ text: z.string().trim().min(1).max(200), projectId: Id.optional(), limit: z.number().int().min(1).max(50).default(20) }),
  "comments.list": z.object({ target: CommentTarget, cursor: z.object({ createdAt: z.number().int(), id: Id }).optional(), limit: z.number().int().min(1).max(200).default(50) }),
  "activity.list": z.object({
    target: ActivityTarget.optional(), before: z.number().int().optional(),
    cursor: z.object({ at: z.number().int(), id: Id }).optional(),
    limit: z.number().int().min(1).max(200).default(50),
  }).refine((a) => a.before === undefined || a.cursor === undefined, "Use either before or cursor"),
} as const;
export type QueryName = keyof typeof querySchemas;

// ---- Server → client ----

export type Snapshot = {
  members: Member[];
  projects: Project[];
  features: Feature[];
  tasks: Task[];
  /** All Topics, resolved or not: small, and past Meetings read them. */
  topics: Topic[];
  meetings: Meeting[];
  pullRequestLinks: PullRequestLink[];
};

export type ErrorCode = "invalid" | "not_found" | "conflict" | "forbidden" | "internal";

export type ServerMessage =
  | { type: "presence"; members: Presence[] }
  | { type: "snapshot"; version: number; memberId: string; data: Snapshot }
  | { type: "change"; version: number; cause?: string; changes: Change[] }
  | { type: "ack"; id: string }
  | { type: "reject"; id: string; error: { code: ErrorCode; message: string } }
  | { type: "result"; id: string; data: unknown }
  | { type: "result_error"; id: string; error: { code: ErrorCode; message: string } };

export type ActivityPage = { items: ActivityItem[]; nextCursor: { at: number; id: string } | null };

export type CommentsPage = { items: Comment[]; nextCursor: { createdAt: number; id: string } | null };
