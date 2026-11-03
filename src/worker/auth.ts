import { createRemoteJWKSet, jwtVerify } from "jose";

export type AuthResult =
  | { ok: true; email: string }
  | { ok: false; status: 401 | 500; message: string };

// Cached per isolate; jose handles key rotation and refetching.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(teamDomain: string) {
  let set = jwksCache.get(teamDomain);
  if (!set) {
    set = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
    jwksCache.set(teamDomain, set);
  }
  return set;
}

/**
 * Resolve the caller's email from the Cloudflare Access JWT (ADR 0003).
 * In local dev, DEV_ACCESS_EMAIL stands in for the JWT. If it is set while
 * ACCESS_AUD is also set, we fail closed so it can never be active in production.
 */
export async function authenticate(request: Request, env: Env): Promise<AuthResult> {
  const devEmail = env.DEV_ACCESS_EMAIL;
  if (devEmail) {
    if (env.ACCESS_AUD) {
      return { ok: false, status: 500, message: "DEV_ACCESS_EMAIL must not be set in production" };
    }
    return { ok: true, email: devEmail };
  }

  if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) {
    return { ok: false, status: 500, message: "Access is not configured" };
  }

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return { ok: false, status: 401, message: "Missing Access token" };

  try {
    const { payload } = await jwtVerify(token, jwks(env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
    });
    if (typeof payload.email !== "string" || !payload.email) {
      return { ok: false, status: 401, message: "Access token has no email" };
    }
    return { ok: true, email: payload.email };
  } catch {
    return { ok: false, status: 401, message: "Invalid Access token" };
  }
}

export function isAdmin(env: Env, email: string): boolean {
  return (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
