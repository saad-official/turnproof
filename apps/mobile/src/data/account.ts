// Account flows that span auth, shared properties, push registration, sync and the upload queue.
// Local properties, turnovers and photos are never touched here (that is `deleteAllLocalData`).
import { deleteAccount, signIn, signOut, signUp } from './auth-client';
import { registerPushDevice, unregisterPushDevice } from './devices';
import { clearSharedProperties, refreshSharedProperties } from './properties-client';
import { setAppValue } from './settings-repo';
import { syncNow, syncStatus } from './sync-client';
import { resetSyncCursors } from './sync-state-repo';
import { kickUploadQueue } from './upload-queue';

type AuthResult = { error?: { message?: string; status?: number } | null };

function failed(res: AuthResult): string | null {
  return res.error ? (res.error.message ?? 'Request failed') : null;
}

/**
 * After a successful sign-in / sign-up: push everything (cursors start empty), pull shared
 * properties, register the push token and resume photo uploads.
 */
export async function afterSignIn(): Promise<void> {
  await syncNow();
  await refreshSharedProperties().catch(() => undefined);
  await registerPushDevice({ prompt: false }).catch(() => undefined);
  kickUploadQueue();
}

/** Email + password sign-in, then `afterSignIn`. Returns an error message or null. */
export async function signInAndSync(input: { email: string; password: string }): Promise<string | null> {
  const error = failed((await signIn(input)) as AuthResult);
  if (!error) await afterSignIn();
  return error;
}

/** Account creation, then `afterSignIn`. Returns an error message or null. */
export async function signUpAndSync(input: { name: string; email: string; password: string }): Promise<string | null> {
  const error = failed((await signUp(input)) as AuthResult);
  if (!error) await afterSignIn();
  return error;
}

/**
 * Signs out: removes this device's push token, forgets cached memberships and sync cursors (the
 * next sign-in pushes everything again). Uploads pause by themselves. Local data stays.
 */
export async function signOutAndForget(): Promise<void> {
  await unregisterPushDevice();
  await signOut().catch(() => undefined);
  clearSharedProperties();
  resetSyncCursors();
  setAppValue('lastSyncAt', undefined);
  setAppValue('lastSyncError', undefined);
  syncStatus.setState({ running: false, lastSyncAt: null, error: null });
  kickUploadQueue(); // re-evaluates and reports `paused: 'signed-out'`
}

/**
 * Deletes the account on the server (cascades its properties, synced rows, uploaded photos, proof
 * links and devices), then clears local account state. Returns an error message or null.
 */
export async function deleteAccountEverywhere(password: string): Promise<string | null> {
  const error = failed((await deleteAccount(password)) as AuthResult);
  if (error) return error;
  await signOutAndForget();
  return null;
}
