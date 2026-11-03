import { generateNKeysBetween } from "fractional-indexing";
import { describe, expect, it } from "vitest";
import type { Task } from "../src/shared/entities";
import { byRank, rankForMove, rankForReorder } from "../src/shared/rank";

const list = (ids: string[]) => {
  const ranks = generateNKeysBetween(null, null, ids.length);
  return ids.map((id, i) => ({ id, rank: ranks[i]! }) as Task);
};

/** Applies the new rank and returns the ids in their new order. */
function reorder(tasks: Task[], from: number, to: number) {
  const rank = rankForReorder(tasks, from, to);
  if (rank === null) return null;
  return tasks.map((t, i) => (i === from ? { ...t, rank } : t)).sort(byRank).map((t) => t.id);
}

describe("rankForReorder", () => {
  const tasks = list(["a", "b", "c", "d"]);

  it("drags an item down, up, to the top and to the bottom", () => {
    expect(reorder(tasks, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(reorder(tasks, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(reorder(tasks, 2, 0)).toEqual(["c", "a", "b", "d"]);
    expect(reorder(tasks, 1, 3)).toEqual(["a", "c", "d", "b"]);
  });

  it("returns null when nothing moves or the index is out of range", () => {
    expect(rankForReorder(tasks, 1, 1)).toBeNull();
    expect(rankForReorder(tasks, 0, 4)).toBeNull();
    expect(rankForReorder(tasks, -1, 0)).toBeNull();
  });

  it("moves one step with the up/down buttons", () => {
    const rank = rankForMove(tasks, 1, -1)!;
    expect(tasks.map((t, i) => (i === 1 ? { ...t, rank } : t)).sort(byRank).map((t) => t.id)).toEqual(["b", "a", "c", "d"]);
    expect(rankForMove(tasks, 0, -1)).toBeNull();
    expect(rankForMove(tasks, 3, 1)).toBeNull();
  });
});
