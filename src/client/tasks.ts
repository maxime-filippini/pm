import { generateKeyBetween } from "fractional-indexing";
import type { Task } from "../shared/entities";

/** Byte order, matching SQLite's ORDER BY on fractional-index keys. Never localeCompare. */
export const byRank = (a: Task, b: Task) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);

/** New rank that moves `list[index]` one step up or down within `list` (already sorted by rank). */
export function rankForMove(list: Task[], index: number, direction: -1 | 1): string | null {
  const target = index + direction;
  if (target < 0 || target >= list.length) return null;
  // Moving up: land between the item above the target and the target. Moving down: between target and the one after.
  const before = direction === -1 ? (list[target - 1]?.rank ?? null) : list[target]!.rank;
  const after = direction === -1 ? list[target]!.rank : (list[target + 1]?.rank ?? null);
  return generateKeyBetween(before, after);
}
