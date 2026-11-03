import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("serves the health check without auth", async () => {
  const res = await SELF.fetch("https://pm.test/api/health");
  expect(res.status).toBe(200);
});

it("returns 401 for /api/me without an Access token", async () => {
  const res = await SELF.fetch("https://pm.test/api/me");
  expect(res.status).toBe(401);
});
