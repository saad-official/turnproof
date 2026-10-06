// Local turnover reminders (expo-notifications): permission flow, Android channels, the iOS
// `turnover` category (Start / Snooze 30 min), a rolling 14-day set of reminders at shared
// `reminderAt` ("Turnover at Maple St in 1 h"), the ongoing "turnover in progress" fallback
// notification (below Android 16), response decoding into deep links, and the Expo push token.
import { formatMinutes, type Property, reminderAt, type Turnover } from '@turnproof/shared';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';
import { Linking, Platform } from 'react-native';

import { getProperties } from '@/data/properties-repo';
import { getSettings } from '@/data/settings-repo';
import { deviceTimeZone, formatClock } from '@/data/time';
import { getTurnover, listTurnoversByStatus } from '@/data/turnovers-repo';

// ---------------------------------------------------------------------------
// Identifiers

export const CATEGORY_TURNOVER = 'turnover';
/** Ongoing "in progress" notification (Android < 16 fallback for the Live Update). */
export const CATEGORY_TURNOVER_LIVE = 'turnover-live';
export const CHANNEL_TURNOVERS = 'turnovers';
/** Shared with expo-live-updates (`channelId` in app.json). */
export const CHANNEL_TURNOVER_LIVE = 'turnover-live';

export const ACTION_START = 'start';
export const ACTION_SNOOZE = 'snooze-30';
export const ACTION_NEXT_ROOM = 'next-room';
export const ACTION_ISSUE = 'issue';
export const SNOOZE_MINUTES = 30;

const REMINDER_PREFIX = 'turnover:';
const LIVE_STATUS_ID = 'turnover-live-status';
export const ROLLING_DAYS = 14;
/** iOS keeps at most 64 pending local notifications per app. */
const MAX_SCHEDULED = Platform.OS === 'ios' ? 60 : 150;

/** Deep links the app routes (Expo Router: `src/app/turnover/[id]…`, `src/app/today…`). */
export const turnoverUrl = (id: string, extra?: 'issue') => `turnproof://turnover/${id}${extra === 'issue' ? '?issue=1' : ''}`;
export const TODAY_URL = 'turnproof://today';

/** `content.data` of every notification Turnproof posts or receives. */
export type TurnproofNotificationData =
  | { kind: 'turnover-reminder'; turnoverId: string; url: string; sig: string }
  | { kind: 'turnover-live'; turnoverId: string; url: string }
  | { kind: 'turnover-finished'; turnoverId: string; url?: string }
  | { kind: 'proof-viewed'; turnoverId: string; url?: string };

export type TurnoverNotificationAction = 'start' | 'snooze' | 'next-room' | 'issue' | 'open';

export type TurnoverNotificationEvent = {
  action: TurnoverNotificationAction;
  turnoverId: string | null;
  /** Deep link to open for taps (`turnproof://turnover/<id>`, `turnproof://today`). */
  url: string | null;
};

// ---------------------------------------------------------------------------
// Setup

let setupPromise: Promise<void> | null = null;

/** Idempotent: foreground presentation, Android channels and categories. Call at startup. */
export function setupNotifications(): Promise<void> {
  if (!setupPromise) {
    Notifications.setNotificationHandler({
      handleNotification: async (n) => {
        const data = n.request.content.data as Partial<TurnproofNotificationData> | undefined;
        const quiet = data?.kind === 'turnover-live';
        return { shouldShowBanner: !quiet, shouldShowList: true, shouldPlaySound: !quiet, shouldSetBadge: false };
      },
    });
    setupPromise = (async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(CHANNEL_TURNOVERS, {
          name: 'Turnover reminders',
          description: 'A reminder before a checkout, and news from shared properties.',
          importance: Notifications.AndroidImportance.HIGH,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
          vibrationPattern: [0, 200, 120, 200],
          enableVibrate: true,
        });
        // expo-live-updates creates this channel at default importance; the in-progress status
        // must stay silent (it updates every room).
        await Notifications.setNotificationChannelAsync(CHANNEL_TURNOVER_LIVE, {
          name: 'Turnover in progress',
          description: 'Ongoing status while a turnover runs: time, rooms done, current room.',
          importance: Notifications.AndroidImportance.LOW,
          sound: null,
          vibrationPattern: null,
          enableVibrate: false,
          showBadge: false,
        });
      }
      await Notifications.setNotificationCategoryAsync(CATEGORY_TURNOVER, [
        { identifier: ACTION_START, buttonTitle: 'Start', options: { opensAppToForeground: true } },
        { identifier: ACTION_SNOOZE, buttonTitle: `Snooze ${SNOOZE_MINUTES} min`, options: { opensAppToForeground: false } },
      ]);
      await Notifications.setNotificationCategoryAsync(CATEGORY_TURNOVER_LIVE, [
        { identifier: ACTION_NEXT_ROOM, buttonTitle: 'Next room', options: { opensAppToForeground: false } },
        { identifier: ACTION_ISSUE, buttonTitle: 'Issue', options: { opensAppToForeground: true } },
      ]);
    })().catch((error) => {
      setupPromise = null;
      throw error;
    });
  }
  return setupPromise;
}

// ---------------------------------------------------------------------------
// Permission

export type NotificationPermission = {
  /** `granted` also covers iOS provisional authorisation. */
  status: 'granted' | 'denied' | 'undetermined';
  canAskAgain: boolean;
};

function toPermission(p: Notifications.NotificationPermissionsStatus): NotificationPermission {
  const iosStatus = p.ios?.status;
  const granted =
    p.granted ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL;
  return { status: granted ? 'granted' : p.status === 'undetermined' ? 'undetermined' : 'denied', canAskAgain: p.canAskAgain };
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  return toPermission(await Notifications.getPermissionsAsync());
}

/** Shows the OS prompt when it still can (after a priming screen); reschedules on grant. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  await setupNotifications(); // Android 13+: a channel must exist before the prompt.
  const current = await getNotificationPermission();
  if (current.status === 'granted' || !current.canAskAgain) return current;
  const next = toPermission(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowBadge: false, allowSound: true } }));
  if (next.status === 'granted') await rescheduleAll().catch(() => undefined);
  return next;
}

/** App settings page (notifications; on Android 12+ also "Alarms & reminders"). */
export function openNotificationSettings(): Promise<void> {
  return Linking.openSettings();
}

// ---------------------------------------------------------------------------
// Snoozes (kept outside the synced turnover row: a snooze is personal to this phone)

const SNOOZE_KEY = 'turnproof.notifications.snoozes';

function readSnoozes(): Record<string, string> {
  try {
    return JSON.parse(Storage.getItemSync(SNOOZE_KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

function writeSnoozes(map: Record<string, string>): void {
  try {
    const now = Date.now();
    const live = Object.fromEntries(Object.entries(map).filter(([, at]) => Date.parse(at) > now - 86_400_000));
    Storage.setItemSync(SNOOZE_KEY, JSON.stringify(live));
  } catch {
    // best effort
  }
}

/** Re-delivers the reminder of `turnoverId` in `minutes` (default 30). */
export async function snoozeTurnoverReminder(turnoverId: string, minutes = SNOOZE_MINUTES): Promise<void> {
  writeSnoozes({ ...readSnoozes(), [turnoverId]: new Date(Date.now() + minutes * 60_000).toISOString() });
  await rescheduleAll();
}

// ---------------------------------------------------------------------------
// Scheduling

type Planned = { identifier: string; date: number; content: Notifications.NotificationContentInput; sig: string };

function hash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

function plan(turnovers: readonly Turnover[], properties: Map<string, Property>, now: number): Planned[] {
  const { reminderLeadMinutes } = getSettings();
  const tz = deviceTimeZone();
  const snoozes = readSnoozes();
  const planned: Planned[] = [];
  for (const t of turnovers) {
    const p = properties.get(t.propertyId);
    if (!p || p.deletedAt) continue;
    const base = reminderAt(t, p, reminderLeadMinutes, tz);
    if (!base) continue;
    const snoozedUntil = snoozes[t.id] ? Date.parse(snoozes[t.id]!) : 0;
    const at = snoozedUntil > now ? snoozedUntil : Date.parse(base);
    if (!(at > now)) continue;
    const minutesLeft = Math.max(0, Math.round((Date.parse(t.scheduledFor) - at) / 60_000));
    const title = minutesLeft > 0 ? `Turnover at ${p.name} in ${formatMinutes(minutesLeft)}` : `Turnover at ${p.name} now`;
    const body = `Checkout ${formatClock(t.scheduledFor, tz)}${p.address ? ` · ${p.address}` : ''}`;
    const url = turnoverUrl(t.id);
    const sig = hash(`${at}|${title}|${body}`);
    const data: TurnproofNotificationData = { kind: 'turnover-reminder', turnoverId: t.id, url, sig };
    planned.push({
      identifier: `${REMINDER_PREFIX}${t.id}`,
      date: at,
      sig,
      content: {
        title,
        body,
        data,
        sound: 'default',
        categoryIdentifier: CATEGORY_TURNOVER,
        interruptionLevel: 'active',
        priority: Notifications.AndroidNotificationPriority.HIGH,
        autoDismiss: true,
      },
    });
  }
  return planned.sort((a, b) => a.date - b.date).slice(0, MAX_SCHEDULED);
}

let syncing: Promise<void> | null = null;
let again = false;

/**
 * Diffs scheduled `turnover:*` reminders against scheduled turnovers of the next 14 days and only
 * cancels / schedules what changed. Coalesces concurrent calls. No-op without permission.
 */
export function rescheduleAll(): Promise<void> {
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

async function syncOnce(): Promise<void> {
  await setupNotifications();
  if ((await getNotificationPermission()).status !== 'granted') return;
  const now = Date.now();
  const horizon = now + ROLLING_DAYS * 86_400_000;
  const scheduledTurnovers = listTurnoversByStatus(['scheduled']).filter((t) => Date.parse(t.scheduledFor) < horizon + 86_400_000);
  const properties = new Map(getProperties([...new Set(scheduledTurnovers.map((t) => t.propertyId))]).map((p) => [p.id, p]));
  const wanted = plan(scheduledTurnovers, properties, now);
  const wantedById = new Map(wanted.map((p) => [p.identifier, p]));

  const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(REMINDER_PREFIX));
  const keep = new Set<string>();
  await Promise.all(
    scheduled.map(async (n) => {
      const data = n.content.data as Partial<TurnproofNotificationData> | undefined;
      const want = wantedById.get(n.identifier);
      if (want && data && 'sig' in data && data.sig === want.sig) {
        keep.add(n.identifier);
        return;
      }
      await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined);
    }),
  );
  for (const p of wanted) {
    if (keep.has(p.identifier)) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: p.identifier,
        content: p.content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.date, channelId: CHANNEL_TURNOVERS },
      });
    } catch (error) {
      console.warn('[notifications] schedule failed', p.identifier, error);
    }
  }
}

/** Removes a delivered reminder (e.g. the turnover was started from the app). */
export async function dismissReminderFor(turnoverId: string): Promise<void> {
  const presented = await Notifications.getPresentedNotificationsAsync().catch(() => []);
  await Promise.all(
    presented
      .filter((n) => {
        const data = n.request.content.data as Partial<TurnproofNotificationData> | undefined;
        return data?.kind === 'turnover-reminder' && data.turnoverId === turnoverId;
      })
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier).catch(() => undefined)),
  );
}

/** Cancels every scheduled turnover reminder (delete all data). */
export async function cancelAllTurnoverNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(REMINDER_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined)),
  );
  await dismissLiveStatusNotification();
}

// ---------------------------------------------------------------------------
// Ongoing "turnover in progress" notification (Android below 16; used by live-status.android.ts)

export async function presentLiveStatusNotification(input: { turnoverId: string; title: string; body: string }): Promise<void> {
  await setupNotifications();
  const data: TurnproofNotificationData = { kind: 'turnover-live', turnoverId: input.turnoverId, url: turnoverUrl(input.turnoverId) };
  await Notifications.scheduleNotificationAsync({
    identifier: LIVE_STATUS_ID, // same id → replaced in place
    content: {
      title: input.title,
      body: input.body,
      data,
      sticky: true,
      autoDismiss: false,
      sound: false,
      priority: Notifications.AndroidNotificationPriority.LOW,
      categoryIdentifier: CATEGORY_TURNOVER_LIVE,
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL_TURNOVER_LIVE } : null,
  });
}

export async function dismissLiveStatusNotification(): Promise<void> {
  await Notifications.dismissNotificationAsync(LIVE_STATUS_ID).catch(() => undefined);
}

// ---------------------------------------------------------------------------
// Responses (action buttons and taps)

const HANDLED_KEY = 'turnproof.notifications.handled';

/** True the first time a response is seen (listener, launch response and Android background task may all fire). */
function firstTime(response: Notifications.NotificationResponse): boolean {
  const key = `${response.notification.request.identifier}|${response.actionIdentifier}|${response.notification.date}`;
  try {
    const seen: string[] = JSON.parse(Storage.getItemSync(HANDLED_KEY) ?? '[]');
    if (seen.includes(key)) return false;
    Storage.setItemSync(HANDLED_KEY, JSON.stringify([...seen.slice(-49), key]));
  } catch {
    // best effort
  }
  return true;
}

export function toTurnoverNotificationEvent(response: Notifications.NotificationResponse): TurnoverNotificationEvent | null {
  const data = (response.notification.request.content.data ?? {}) as Partial<TurnproofNotificationData> & { url?: string };
  const turnoverId = typeof data.turnoverId === 'string' ? data.turnoverId : null;
  const id = response.actionIdentifier;
  if (id === ACTION_START) return turnoverId ? { action: 'start', turnoverId, url: turnoverUrl(turnoverId) } : null;
  if (id === ACTION_SNOOZE) return turnoverId ? { action: 'snooze', turnoverId, url: null } : null;
  if (id === ACTION_NEXT_ROOM) return turnoverId ? { action: 'next-room', turnoverId, url: null } : null;
  if (id === ACTION_ISSUE) return turnoverId ? { action: 'issue', turnoverId, url: turnoverUrl(turnoverId, 'issue') } : null;
  if (id === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    const url = typeof data.url === 'string' ? data.url : turnoverId ? turnoverUrl(turnoverId) : TODAY_URL;
    return { action: 'open', turnoverId, url };
  }
  return null;
}

/** Decodes a response once (deduped across listener / launch / background task). */
export function claimNotificationResponse(response: Notifications.NotificationResponse): TurnoverNotificationEvent | null {
  const event = toTurnoverNotificationEvent(response);
  if (!event || !firstTime(response)) return null;
  // Android leaves a reminder up after a background action; clear it (never the live status).
  if ((event.action === 'snooze' || event.action === 'start') && response.notification.request.identifier !== LIVE_STATUS_ID) {
    Notifications.dismissNotificationAsync(response.notification.request.identifier).catch(() => undefined);
  }
  return event;
}

const responseListeners = new Set<(event: TurnoverNotificationEvent) => void>();
let responseSub: { remove(): void } | null = null;

/** Action buttons and taps while JS runs; one native subscription fans out. Returns unsubscribe. */
export function addNotificationResponseListener(listener: (event: TurnoverNotificationEvent) => void): () => void {
  responseListeners.add(listener);
  if (!responseSub) {
    responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const event = claimNotificationResponse(response);
      if (event) responseListeners.forEach((l) => l(event));
    });
  }
  return () => {
    responseListeners.delete(listener);
    if (!responseListeners.size) {
      responseSub?.remove();
      responseSub = null;
    }
  };
}

/** Notification taps that should navigate (Start / Issue navigate via status-actions). Returns unsubscribe. */
export function addNotificationOpenListener(listener: (url: string) => void): () => void {
  return addNotificationResponseListener((event) => {
    if (event.action === 'open' && event.url) listener(event.url);
  });
}

/** The response that cold-launched the app, handled once. */
export async function consumeLaunchNotificationResponse(): Promise<TurnoverNotificationEvent | null> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return null;
  await Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
  return claimNotificationResponse(response);
}

/** Fires when a turnover reminder or push arrives while the app is open. */
export function addTurnoverNotificationReceivedListener(listener: () => void): () => void {
  const sub = Notifications.addNotificationReceivedListener((n) => {
    const data = n.request.content.data as Partial<TurnproofNotificationData> | undefined;
    if (data?.kind === 'turnover-reminder' || data?.kind === 'turnover-finished') listener();
  });
  return () => sub.remove();
}

/** True when the turnover still exists and is scheduled (for "Start" from a stale reminder). */
export function isStartable(turnoverId: string): boolean {
  const t = getTurnover(turnoverId);
  return !!t && !t.deletedAt && t.status === 'scheduled';
}

// ---------------------------------------------------------------------------
// Expo push token (a host hears when a cleaner finishes)

export type PushRegistration =
  | { ok: true; token: string; platform: 'ios' | 'android' }
  | { ok: false; reason: 'not-a-device' | 'unsupported' | 'permission-denied' | 'missing-project-id' | 'error'; message?: string };

/** EAS project id from app config (`extra.eas.projectId`), or null before `eas init`. */
export function getEasProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

/** Expo push token for `POST /api/devices`. Never throws; never prompts unless `prompt` is true. */
export async function getPushRegistration(opts: { prompt?: boolean } = {}): Promise<PushRegistration> {
  try {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return { ok: false, reason: 'unsupported' };
    if (!Device.isDevice) return { ok: false, reason: 'not-a-device' };
    const projectId = getEasProjectId();
    if (!projectId) return { ok: false, reason: 'missing-project-id' };
    const permission = opts.prompt ? await requestNotificationPermission() : await getNotificationPermission();
    if (permission.status !== 'granted') return { ok: false, reason: 'permission-denied' };
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { ok: true, token: data, platform: Platform.OS };
  } catch (error) {
    return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
