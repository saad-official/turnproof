import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { optionalEnv } from "@/lib/env";

/**
 * Shared-secret checks for machine-to-machine routes. Both sides are hashed
 * first so the comparison is constant-time regardless of length. A missing
 * secret rejects everything rather than accepting an empty one.
 */
export function secretsMatch(provided: string | null | undefined, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function bearerToken(request: Request): string | undefined {
  const header = request.headers.get("authorization") ?? "";
  return /^Bearer\s+(.+)$/i.exec(header.trim())?.[1];
}

/** `Authorization: Bearer <envName value>`; false (and a log line) when the variable is unset. */
export function hasBearerSecret(request: Request, envName: string): boolean {
  const expected = optionalEnv(envName);
  if (!expected) console.error(`[api] ${envName} is not set; rejecting request`);
  return secretsMatch(bearerToken(request), expected);
}

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. */
export function isAuthorizedCron(request: Request): boolean {
  return hasBearerSecret(request, "CRON_SECRET");
}
