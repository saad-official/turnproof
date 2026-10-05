import "server-only";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, type Db } from "@/lib/db/client";
import { account, session, user, verification } from "@/lib/db/schema";
import { deleteStoredPhotosOf } from "@/lib/services/account";

/** Cookie names become `turnproof.session_token` etc., so a shared domain never collides with a sibling app. */
export const AUTH_COOKIE_PREFIX = "turnproof";
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;
/** The Expo app's URL scheme (apps/mobile/app.json `scheme`). */
export const APP_SCHEME_ORIGIN = "turnproof://";

/**
 * Development-only fallback so `pnpm dev` works before .env.local exists.
 * High entropy (Better Auth warns on weak secrets) but public: sessions
 * signed with it are worthless outside your machine.
 */
const DEV_FALLBACK_SECRET = "turnproof-dev-only-4Tw8nB2qXk6Lp9Rv3Hc7Mz1Yd5Gf0Se";

function resolveSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is not set. Generate one with `openssl rand -base64 32`.");
  }
  console.warn("[auth] BETTER_AUTH_SECRET is not set: using the public dev secret. Sessions are NOT secure.");
  return DEV_FALLBACK_SECRET;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3900";
}

/**
 * The app scheme, the public origin(s) and localhost. Outside production any
 * local port and Expo Go (`exp://`) are trusted too.
 */
export function trustedOrigins(): string[] {
  const origins = new Set<string>([APP_SCHEME_ORIGIN, "http://localhost:3900", "http://127.0.0.1:3900"]);
  if (process.env.NODE_ENV !== "production") {
    origins.add("http://localhost:*");
    origins.add("http://127.0.0.1:*");
    origins.add("exp://");
  }
  for (const value of [process.env.NEXT_PUBLIC_APP_URL, process.env.BETTER_AUTH_URL]) {
    if (!value) continue;
    try {
      origins.add(new URL(value).origin);
    } catch {
      // ignore malformed values; Better Auth validates baseURL itself
    }
  }
  return [...origins];
}

export function createAuth(db: Db) {
  return betterAuth({
    appName: "Turnproof",
    baseURL: process.env.BETTER_AUTH_URL ?? appUrl(),
    secret: resolveSecret(),
    trustedOrigins: trustedOrigins(),
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: MIN_PASSWORD_LENGTH,
      maxPasswordLength: MAX_PASSWORD_LENGTH,
      autoSignIn: true,
    },
    // POST /api/auth/delete-user (password confirmation). Foreign keys cascade
    // memberships, owned properties (and their turnovers, photos, proofs) and devices away with the user row.
    user: {
      deleteUser: {
        enabled: true,
        // Rows cascade with the user; stored photo bytes (Vercel Blob) do not, so remove them first.
        beforeDelete: async (deleted) => {
          await deleteStoredPhotosOf(db, deleted.id);
        },
      },
    },
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      cookiePrefix: AUTH_COOKIE_PREFIX,
    },
    telemetry: { enabled: false },
    // expo(): accepts the `expo-origin` header the Expo client sends and
    // handles deep-link redirects back into turnproof://.
    plugins: [expo()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth["$Infer"]["Session"];

let authPromise: Promise<Auth> | undefined;

/**
 * Lazy Better Auth instance bound to the lazy database. Nothing is created
 * (and no secret is required) until the first auth call, so builds and
 * imports never need credentials.
 */
export function getAuth(): Promise<Auth> {
  if (!authPromise) {
    authPromise = getDb()
      .then(createAuth)
      .catch((error: unknown) => {
        authPromise = undefined;
        throw error;
      });
  }
  return authPromise;
}

/** Tests: drop the cached instance (e.g. after swapping the database). */
export function resetAuthForTests(): void {
  authPromise = undefined;
}
