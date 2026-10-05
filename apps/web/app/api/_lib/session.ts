import "server-only";
import { getAuth, type AuthSession } from "@/lib/auth/server";
import { ApiError } from "./respond";

export type SessionUser = AuthSession["user"];

/**
 * The signed-in user for an API request, from the Better Auth session in the
 * request headers (the Expo client sends `Cookie: turnproof.session_token=...`).
 * Throws a 401 `ApiError` when there is no valid session.
 */
export async function requireUser(request: Request): Promise<SessionUser> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new ApiError(401, "unauthorized", "unauthorized");
  return session.user;
}
