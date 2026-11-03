import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { authenticate } from "../src/worker/auth";

const req = (headers: Record<string, string> = {}) => new Request("https://pm.test/api/me", { headers });

describe("authenticate", () => {
  it("rejects a request with no Access token", async () => {
    expect(await authenticate(req(), env)).toMatchObject({ ok: false, status: 401 });
  });

  it("rejects a malformed Access token", async () => {
    const result = await authenticate(req({ "Cf-Access-Jwt-Assertion": "not-a-jwt" }), env);
    expect(result).toMatchObject({ ok: false, status: 401 });
  });

  it("fails closed when DEV_ACCESS_EMAIL is set alongside ACCESS_AUD", async () => {
    const result = await authenticate(req(), { ...env, DEV_ACCESS_EMAIL: "dev@example.com" });
    expect(result).toMatchObject({ ok: false, status: 500 });
  });

  it("uses DEV_ACCESS_EMAIL in local dev", async () => {
    const result = await authenticate(req(), { ...env, DEV_ACCESS_EMAIL: "dev@example.com", ACCESS_AUD: "" });
    expect(result).toEqual({ ok: true, email: "dev@example.com" });
  });
});
