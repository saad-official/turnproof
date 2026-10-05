// Better Auth client for the Turnproof API (email + password; the server runs the Expo plugin).
// The session cookie lives in SecureStore via `expoClient`; `apiFetch` (api.ts) forwards it.
import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

/** API origin: `EXPO_PUBLIC_API_URL` (e.g. http://192.168.1.20:3900 for a local server), else production. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://getturnproof.vercel.app').replace(/\/+$/, '');

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: 'turnproof',
      storagePrefix: 'turnproof',
      // Matches the server's `advanced.cookiePrefix` (cookies are `turnproof.session_token`, …).
      cookiePrefix: 'turnproof',
      storage: SecureStore,
    }),
  ],
});

export type AuthSession = typeof authClient.$Infer.Session;

/** The stored session cookie header value ('' when signed out). Works in headless JS too. */
export async function getSessionCookie(): Promise<string> {
  try {
    return (await authClient.getCookie()) ?? '';
  } catch {
    return '';
  }
}

/** True when a session cookie is stored (it may still be expired: the API then answers 401). */
export async function isSignedIn(): Promise<boolean> {
  return (await getSessionCookie()).length > 0;
}

export async function signUp(input: { name: string; email: string; password: string }) {
  return authClient.signUp.email(input);
}

export async function signIn(input: { email: string; password: string }) {
  return authClient.signIn.email(input);
}

export async function signOut() {
  return authClient.signOut();
}

/** Deletes the account server-side (cascades properties the user owns, synced rows, photos, proofs, devices). Needs the password. */
export async function deleteAccount(password: string) {
  return authClient.deleteUser({ password });
}
