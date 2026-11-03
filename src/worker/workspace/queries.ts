import type { Snapshot } from "../../shared/protocol";
import { all, toActivity, toFeature, toMember, toProject, toTask } from "./rows";

export function snapshot(sql: SqlStorage): Snapshot {
  return {
    members: all(sql, toMember, "SELECT * FROM members ORDER BY name"),
    projects: all(sql, toProject, "SELECT * FROM projects ORDER BY name"),
    features: all(sql, toFeature, "SELECT * FROM features"),
    tasks: all(sql, toTask, "SELECT * FROM tasks ORDER BY rank"),
  };
}

export function activityList(sql: SqlStorage, args: { before?: number; limit: number }) {
  const items =
    args.before === undefined
      ? all(sql, toActivity, "SELECT * FROM activity ORDER BY at DESC, id DESC LIMIT ?", args.limit)
      : all(sql, toActivity, "SELECT * FROM activity WHERE at < ? ORDER BY at DESC, id DESC LIMIT ?", args.before, args.limit);
  return { items };
}
