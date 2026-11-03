/// <reference types="vite/client" />
import { expect, it } from "vitest";

// Hibernation rule (ADR 0002): no timers in the Durable Object; use alarms.
const sources = import.meta.glob("../src/worker/workspace/**/*.ts", { query: "?raw", import: "default", eager: true });

it("has no setTimeout/setInterval in src/worker/workspace", () => {
  expect(Object.keys(sources).length).toBeGreaterThan(0);
  const offenders = Object.entries(sources)
    .filter(([, code]) => /\bset(Timeout|Interval)\s*\(/.test(code as string))
    .map(([file]) => file);
  expect(offenders).toEqual([]);
});
