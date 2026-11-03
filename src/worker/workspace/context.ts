import { uuidv7 } from "../../shared/ids";
import type { Change, ErrorCodeLike } from "./types";
import { toActivity } from "./rows";

export class CommandError extends Error {
  constructor(
    readonly code: ErrorCodeLike,
    message: string,
  ) {
    super(message);
  }
}

/** Everything a command handler needs. Handlers are synchronous: no await between writes. */
export class CommandContext {
  readonly changes: Change[] = [];

  constructor(
    readonly sql: SqlStorage,
    readonly actorId: string,
    readonly via: string | null,
    readonly now: number,
  ) {}

  emit(change: Change): void {
    this.changes.push(change);
  }

  activity(kind: string, targetType: string, targetId: string, data: Record<string, unknown> = {}): void {
    const id = uuidv7(this.now);
    const json = JSON.stringify(data);
    this.sql.exec(
      "INSERT INTO activity (id, at, actor_id, via, kind, target_type, target_id, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id, this.now, this.actorId, this.via, kind, targetType, targetId, json,
    );
    this.emit({
      entity: "activity",
      op: "upsert",
      row: toActivity({ id, at: this.now, actor_id: this.actorId, via: this.via, kind, target_type: targetType, target_id: targetId, data: json }),
    });
  }
}
