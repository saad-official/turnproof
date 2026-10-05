// Registers this install's Expo push token with the API so a host is told when a cleaner finishes a turnover.
import { getPushRegistration } from '@/native/notifications';

import { apiFetch } from './api';
import { isSignedIn } from './auth-client';
import { getAppValue, setAppValue } from './settings-repo';

export type DeviceRegistration = { ok: true; token: string } | { ok: false; reason: string };

/**
 * POST /api/devices with the Expo push token (needs sign-in, notification permission and an EAS
 * project id). Re-posts only when the token changed. `prompt` shows the permission prompt if needed.
 */
export async function registerPushDevice(opts: { prompt?: boolean; force?: boolean } = {}): Promise<DeviceRegistration> {
  if (!(await isSignedIn())) return { ok: false, reason: 'signed-out' };
  const reg = await getPushRegistration({ prompt: opts.prompt });
  if (!reg.ok) return { ok: false, reason: reg.reason };
  if (!opts.force && getAppValue<string | null>('pushToken', null) === reg.token) return { ok: true, token: reg.token };
  await apiFetch('/api/devices', { method: 'POST', body: { token: reg.token, platform: reg.platform } });
  setAppValue('pushToken', reg.token);
  return { ok: true, token: reg.token };
}

/** DELETE /api/devices/:token (sign-out). Best effort. */
export async function unregisterPushDevice(): Promise<void> {
  const token = getAppValue<string | null>('pushToken', null);
  if (!token) return;
  try {
    await apiFetch(`/api/devices/${encodeURIComponent(token)}`, { method: 'DELETE' });
  } catch {
    // the server prunes dead tokens anyway
  }
  setAppValue('pushToken', undefined);
}
