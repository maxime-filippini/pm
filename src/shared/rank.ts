import { generateKeyBetween } from "fractional-indexing";

type Ranked = { rank: string };

/** Byte order, matching SQLite's ORDER BY on fractional-index keys. Never localeCompare. */
export const byRank = (a: Ranked, b: Ranked) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0);

/**
 * New rank that puts `list[from]` at index `to` of the reordered list (`list` already sorted by rank).
 * Null when nothing moves.
 */
export function rankForReorder(list: Ranked[], from: number, to: number): string | null {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return null;
  const rest = list.filter((_, i) => i !== from);
  return generateKeyBetween(rest[to - 1]?.rank ?? null, rest[to]?.rank ?? null);
}

/** New rank that moves `list[index]` one step up or down. */
export const rankForMove = (list: Ranked[], index: number, direction: -1 | 1) => rankForReorder(list, index, index + direction);
