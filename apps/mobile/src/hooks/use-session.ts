import { authClient } from '@/data/auth-client';

/**
 * Better Auth session (`{ data, isPending, error, refetch }`); `data` is null when signed out.
 * Sign in / up / out with `signInAndSync`, `signUpAndSync`, `signOutAndForget` from `@/data`.
 */
export function useSession() {
  return authClient.useSession();
}
