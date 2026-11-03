import { generateKeyBetween } from "fractional-indexing";
import type { Task } from "./entities";

/** Byte order, matching SQLite's ORDER BY on fractional-index keys. Never localeCompare. */
export const byRank = (a: Task, b: Task) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);

/**
 * New rank that puts `list[from]` at index `to` of the reordered list (`list` already sorted by rank).
 * Null when nothing moves.
 */
export function rankForReorder(list: Task[], from: number, to: number): string | null {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return null;
  const rest = list.filter((_, i) => i !== from);
  return generateKeyBetween(rest[to - 1]?.rank ?? null, rest[to]?.rank ?? null);
}

/** New rank that moves `list[index]` one step up or down. */
export const rankForMove = (list: Task[], index: number, direction: -1 | 1) => rankForReorder(list, index, index + direction);
