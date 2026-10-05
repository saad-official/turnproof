// User intents. Each applies the shared state machine (`@turnproof/shared` turnover.ts), stamps
// `updatedAt`, persists synchronously (hooks update at once), then refreshes the native surfaces
// (reminders, Live Activity / Live Update, widgets) and schedules a sync. Await them in headless
// code (notification actions, Live Activity buttons, background task) so surfaces finish first.
import {
  abandon,
  addPhoto as sharedAddPhoto,
  completeRoom as sharedCompleteRoom,
  DEFAULT_SUPPLIES,
  defaultPropertyRooms,
  finish,
  goToRoom as sharedGoToRoom,
  type Issue,
  IssueSchema,
  type IssueSeverity,
  newRoomFromTemplate,
  nextIncompleteRoomIndex,
  type Photo,
  type PhotoPhase,
  PhotoSchema,
  type Property,
  PropertySchema,
  removePhoto as sharedRemovePhoto,
  type Room,
  type RoomKind,
  type Settings,
  start,
  toggleItem as sharedToggleItem,
  type TransitionReason,
  type Turnover,
  type TurnoverEvent,
  TurnoverSchema,
  turnoverWindow,
} from '@turnproof/shared';
import { eq, inArray } from 'drizzle-orm';

import type { CaptureResult } from '@/native/capture';
import { cancelAllTurnoverNotifications } from '@/native/notifications';
import { deleteAllPhotoFiles, deletePhotoFile } from '@/native/photo-files';
import { refreshSurfaces } from '@/native/surfaces';

import { isSignedIn } from './auth-client';
import { getIssue, saveIssue } from './issues-repo';
import { markLocalRun } from './local-runs';
import { type LocalPhoto, newId, newLocalId, type ProofLink } from './mappers';
import { allPhotosOfTurnover, getPhoto, listPhotos, savePhoto } from './photos-repo';
import { removePropertyMember } from './properties-client';
import { getProperty, saveProperty } from './properties-repo';
import { createProof, revokeProofLink } from './proofs-client';
import { currentProof } from './proofs-repo';
import { wipeAllTables } from './reset';
import { updateSettings as writeSettings } from './settings-repo';
import { db } from './db';
import { issues, photos, properties, proofs, turnovers } from './schema';
import { notifyTables } from './store';
import { pushDirty, scheduleSync } from './sync-client';
import { deviceTimeZone, nowIso } from './time';
import { getTurnover, listTurnoversForProperty, saveTurnover } from './turnovers-repo';
import { kickUploadQueue, uploadTurnoverPhotos } from './upload-queue';

function afterWrite(opts: { turnoverId?: string; skipNotifications?: boolean } = {}): Promise<void> {
  scheduleSync();
  return refreshSurfaces(opts);
}

// ---------------------------------------------------------------------------
// Results

export type ActionFailure = TransitionReason | 'not-found';

export type TurnoverActionResult =
  | { ok: true; turnover: Turnover; events: TurnoverEvent[] }
  | { ok: false; reason: ActionFailure; turnover: Turnover | null; incompleteRoomIds?: string[] };

const notFound = (): TurnoverActionResult => ({ ok: false, reason: 'not-found', turnover: null });

/** Loads turnover + property, applies a pure transition, stamps `updatedAt` and saves (only when it changed). */
function applyTransition(
  id: string,
  fn: (
    t: Turnover,
    p: Property,
    now: string,
  ) => { ok: true; turnover: Turnover; events: TurnoverEvent[] } | { ok: false; reason: TransitionReason; incompleteRoomIds?: string[] },
): TurnoverActionResult {
  const t = getTurnover(id);
  if (!t || t.deletedAt) return notFound();
  const p = getProperty(t.propertyId);
  if (!p) return notFound();
  const now = nowIso();
  const r = fn(t, p, now);
  if (!r.ok) return { ok: false, reason: r.reason, turnover: t, incompleteRoomIds: r.incompleteRoomIds };
  if (r.turnover === t) return { ok: true, turnover: t, events: r.events };
  const saved = saveTurnover(TurnoverSchema.parse({ ...r.turnover, updatedAt: now }));
  return { ok: true, turnover: saved, events: r.events };
}

// ---------------------------------------------------------------------------
// Properties

export type PropertyInput = {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** `HH:mm`, default 11:00 / 16:00. */
  checkoutTime?: string;
  checkinTime?: string;
  accessNotes?: string | null;
  /**
   * `true` (default): the default walk-through (bedroom, bathroom, kitchen, living, entry) from the
   * shared room templates. Or the room kinds to create, in order. `false`: no rooms.
   */
  fromTemplate?: boolean | readonly RoomKind[];
  /** Explicit rooms (wins over `fromTemplate`). */
  rooms?: Room[];
  /** Default: shared `DEFAULT_SUPPLIES`. */
  supplies?: string[];
};

export type PropertyPatch = Partial<Omit<Property, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'inviteCode'>>;

/** A fresh room of `kind` from the shared template (new ids), for the property editor. */
export function newRoom(kind: RoomKind, name?: string): Room {
  return newRoomFromTemplate(kind, newLocalId, name);
}

/** A new checklist item for the property editor. */
export function newChecklistItem(label: string, required = true): Room['items'][number] {
  return { id: newLocalId(), label: label.trim(), required };
}

/** Creates a property (validated); rooms come from the shared templates unless given. */
export async function createProperty(input: PropertyInput): Promise<Property> {
  const now = nowIso();
  const template = input.fromTemplate ?? true;
  const rooms =
    input.rooms ??
    (template === true ? defaultPropertyRooms(newLocalId) : template === false ? [] : template.map((k) => newRoom(k)));
  const property = PropertySchema.parse({
    id: newId(),
    name: input.name,
    address: input.address ?? null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    checkoutTime: input.checkoutTime ?? '11:00',
    checkinTime: input.checkinTime ?? '16:00',
    accessNotes: input.accessNotes ?? null,
    rooms,
    supplies: input.supplies ?? [...DEFAULT_SUPPLIES],
    inviteCode: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  saveProperty(property);
  await afterWrite({ skipNotifications: true });
  return property;
}

/**
 * Edits a property (name, times, rooms and their checklist items, supplies, notes). A checkout-time
 * change re-plans reminders. Running turnovers keep their room states (by room id).
 */
export async function updateProperty(id: string, patch: PropertyPatch): Promise<Property> {
  const current = getProperty(id);
  if (!current || current.deletedAt) throw new Error('Property not found');
  const next = PropertySchema.parse({ ...current, ...patch, id, updatedAt: nowIso() });
  saveProperty(next);
  await afterWrite();
  return next;
}

/** Soft-deletes a property and its scheduled (not started) turnovers; history stays. */
export async function deleteProperty(id: string): Promise<void> {
  const current = getProperty(id);
  if (!current || current.deletedAt) return;
  const now = nowIso();
  saveProperty({ ...current, deletedAt: now, updatedAt: now });
  for (const t of listTurnoversForProperty(id)) {
    if (t.status === 'scheduled') saveTurnover({ ...t, deletedAt: now, updatedAt: now });
  }
  await afterWrite();
}

export type LeavePropertyResult = { ok: true } | { ok: false; reason: 'pending-uploads' | 'signed-out' | 'error'; message?: string };

/**
 * Leaves a property shared with you (DELETE …/members/me), then removes its local copy (property,
 * turnovers, photos and their files, issues). Refuses while photos of it are still waiting to
 * upload unless `force`.
 */
export async function leaveProperty(propertyId: string, opts: { force?: boolean } = {}): Promise<LeavePropertyResult> {
  if (!(await isSignedIn())) return { ok: false, reason: 'signed-out' };
  const turnoverIds = listTurnoversForProperty(propertyId).map((t) => t.id);
  const pending = turnoverIds.flatMap((id) => listPhotos(id)).filter((p) => p.uploadState !== 'uploaded' && p.localUri);
  if (pending.length && !opts.force) return { ok: false, reason: 'pending-uploads' };
  try {
    await removePropertyMember(propertyId, 'me');
  } catch (error) {
    return { ok: false, reason: 'error', message: error instanceof Error ? error.message : String(error) };
  }
  // Local purge without tombstones: the property is still alive for its other members.
  for (const id of turnoverIds) for (const p of allPhotosOfTurnover(id)) deletePhotoFile(p.localUri);
  db.transaction((tx) => {
    if (turnoverIds.length) {
      tx.delete(photos).where(inArray(photos.turnoverId, turnoverIds)).run();
      tx.delete(issues).where(inArray(issues.turnoverId, turnoverIds)).run();
      tx.delete(proofs).where(inArray(proofs.turnoverId, turnoverIds)).run();
      tx.delete(turnovers).where(inArray(turnovers.id, turnoverIds)).run();
    }
    tx.delete(properties).where(eq(properties.id, propertyId)).run();
  });
  notifyTables('photos', 'issues', 'proofs', 'turnovers', 'properties');
  for (const id of turnoverIds) markLocalRun(id, false);
  await refreshSurfaces();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Scheduling

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Schedules a turnover. `scheduledFor` is either an ISO instant or a local `YYYY-MM-DD` day, which
 * becomes that day's checkout instant (shared `turnoverWindow`, DST-safe).
 */
export async function scheduleTurnover(propertyId: string, scheduledFor: string): Promise<Turnover> {
  const property = getProperty(propertyId);
  if (!property || property.deletedAt) throw new Error('Property not found');
  const at = DAY_KEY_RE.test(scheduledFor)
    ? turnoverWindow(property, scheduledFor, deviceTimeZone()).checkoutAt
    : new Date(Date.parse(scheduledFor)).toISOString();
  const now = nowIso();
  const turnover = TurnoverSchema.parse({
    id: newId(),
    propertyId,
    scheduledFor: at,
    status: 'scheduled',
    currentRoomIndex: 0,
    roomStates: [],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  saveTurnover(turnover);
  await afterWrite({ turnoverId: turnover.id });
  return turnover;
}

/** Moves a scheduled turnover (ISO instant or local day as in `scheduleTurnover`). */
export async function rescheduleTurnover(id: string, scheduledFor: string): Promise<TurnoverActionResult> {
  const r = applyTransition(id, (t, p) => {
    if (t.status !== 'scheduled') return { ok: false, reason: 'not-scheduled' };
    const at = DAY_KEY_RE.test(scheduledFor)
      ? turnoverWindow(p, scheduledFor, deviceTimeZone()).checkoutAt
      : new Date(Date.parse(scheduledFor)).toISOString();
    return { ok: true, turnover: { ...t, scheduledFor: at }, events: [] };
  });
  if (r.ok) await afterWrite({ turnoverId: id });
  return r;
}

/** Removes a scheduled turnover (soft delete; a started one must be abandoned instead). */
export async function deleteTurnover(id: string): Promise<TurnoverActionResult> {
  const r = applyTransition(id, (t, _p, now) =>
    t.status !== 'scheduled' ? { ok: false, reason: 'not-scheduled' } : { ok: true, turnover: { ...t, deletedAt: now }, events: [] },
  );
  if (r.ok) await afterWrite({ turnoverId: id });
  return r;
}

// ---------------------------------------------------------------------------
// Running a turnover

/** Starts a scheduled turnover on this device (Live Activity / Live Update follow). */
export async function startTurnover(id: string): Promise<TurnoverActionResult> {
  const r = applyTransition(id, (t, p, now) => start(t, p, now));
  if (r.ok) {
    markLocalRun(id, true);
    await afterWrite({ turnoverId: id });
  }
  return r;
}

export async function toggleItem(turnoverId: string, roomId: string, itemId: string): Promise<TurnoverActionResult> {
  const r = applyTransition(turnoverId, (t) => sharedToggleItem(t, roomId, itemId));
  if (r.ok) await afterWrite({ turnoverId, skipNotifications: true });
  return r;
}

export type CapturePhotoResult =
  | { ok: true; photo: LocalPhoto; turnover: Turnover }
  | { ok: false; reason: ActionFailure | 'invalid-photo'; message?: string };

/**
 * Stores a processed capture (`takeProofPhoto` / `importReferencePhoto` from `@/native/capture`)
 * as a photo of `turnoverId`. `before` / `after` attach to the room (camera only; the turnover must
 * be running); `issue` photos are usually added through `addIssue`; `reference` is for gallery
 * imports (never proof). On refusal the file is deleted and nothing is stored.
 */
export async function capturePhoto(
  turnoverId: string,
  roomId: string | null | undefined,
  phase: PhotoPhase,
  capture: CaptureResult,
): Promise<CapturePhotoResult> {
  const t = getTurnover(turnoverId);
  if (!t || t.deletedAt) {
    deletePhotoFile(capture.localUri);
    return { ok: false, reason: 'not-found' };
  }
  const now = nowIso();
  const parsed = PhotoSchema.safeParse({
    id: capture.id,
    turnoverId,
    roomId: roomId ?? null,
    phase,
    localUri: capture.localUri,
    remoteUrl: null,
    width: capture.width,
    height: capture.height,
    stamp: capture.stamp,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  if (!parsed.success) {
    deletePhotoFile(capture.localUri);
    return { ok: false, reason: 'invalid-photo', message: parsed.error.issues[0]?.message };
  }
  const photo: Photo = parsed.data;
  const r = applyTransition(turnoverId, (turnover) => sharedAddPhoto(turnover, photo));
  if (!r.ok) {
    deletePhotoFile(capture.localUri);
    return { ok: false, reason: r.reason };
  }
  const local = savePhoto({ ...photo, uploadState: 'local', uploadAttempts: 0, uploadError: null, nextAttemptAt: null });
  await afterWrite({ turnoverId, skipNotifications: true });
  kickUploadQueue();
  return { ok: true, photo: local, turnover: r.turnover };
}

/** Removes a photo (retake / mistake): detaches it from its room (may reopen it) and deletes the file. */
export async function deletePhoto(photoId: string): Promise<TurnoverActionResult> {
  const photo = getPhoto(photoId);
  if (!photo || photo.deletedAt) return notFound();
  const isRoomPhoto = photo.phase === 'before' || photo.phase === 'after';
  const r = isRoomPhoto ? applyTransition(photo.turnoverId, (t) => sharedRemovePhoto(t, photoId)) : null;
  if (r && !r.ok) return r;
  const now = nowIso();
  deletePhotoFile(photo.localUri);
  savePhoto({ ...photo, localUri: null, deletedAt: now, updatedAt: now });
  await afterWrite({ turnoverId: photo.turnoverId, skipNotifications: true });
  return r ?? { ok: true, turnover: getTurnover(photo.turnoverId)!, events: [] };
}

/** Marks a room done (all required items + an after photo when required), then moves to the next incomplete room. */
export async function completeRoom(turnoverId: string, roomId: string): Promise<TurnoverActionResult> {
  const r = applyTransition(turnoverId, (t, p, now) => sharedCompleteRoom(t, p, roomId, now));
  if (r.ok) await afterWrite({ turnoverId, skipNotifications: true });
  return r;
}

/** Jumps to a room by index. */
export async function goToRoom(turnoverId: string, index: number): Promise<TurnoverActionResult> {
  const r = applyTransition(turnoverId, (t) => sharedGoToRoom(t, index));
  if (r.ok) await afterWrite({ turnoverId, skipNotifications: true });
  return r;
}

/**
 * "Next room" (Live Activity / notification button): the next incomplete room after the current
 * one, else simply the following room. No-op on the last room when everything is done.
 */
export async function goToNextRoom(turnoverId: string): Promise<TurnoverActionResult> {
  const r = applyTransition(turnoverId, (t, p) => {
    const n = t.roomStates.length;
    if (n === 0) return { ok: true, turnover: t, events: [] };
    const after = (t.currentRoomIndex + 1) % n;
    const target = nextIncompleteRoomIndex(p, t, after) ?? Math.min(t.currentRoomIndex + 1, n - 1);
    return sharedGoToRoom(t, target);
  });
  if (r.ok) await afterWrite({ turnoverId, skipNotifications: true });
  return r;
}

export type IssueInput = {
  roomId?: string | null;
  severity: IssueSeverity;
  note?: string;
  /** A camera capture to attach (stored as an `issue` photo). */
  photo?: CaptureResult | null;
};

export type AddIssueResult = { ok: true; issue: Issue } | { ok: false; reason: ActionFailure | 'invalid-issue' | 'invalid-photo'; message?: string };

/** Reports damage / a problem (photo + note + severity), optionally for a room. */
export async function addIssue(turnoverId: string, input: IssueInput): Promise<AddIssueResult> {
  const t = getTurnover(turnoverId);
  if (!t || t.deletedAt) {
    if (input.photo) deletePhotoFile(input.photo.localUri);
    return { ok: false, reason: 'not-found' };
  }
  let photoId: string | null = null;
  if (input.photo) {
    const stored = await capturePhoto(turnoverId, input.roomId ?? null, 'issue', input.photo);
    if (!stored.ok) return { ok: false, reason: stored.reason, message: stored.message };
    photoId = stored.photo.id;
  }
  const now = nowIso();
  const parsed = IssueSchema.safeParse({
    id: newId(),
    turnoverId,
    roomId: input.roomId ?? null,
    photoId,
    severity: input.severity,
    note: input.note ?? '',
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  if (!parsed.success) return { ok: false, reason: 'invalid-issue', message: parsed.error.issues[0]?.message };
  const issue = saveIssue(parsed.data);
  await afterWrite({ turnoverId, skipNotifications: true });
  return { ok: true, issue };
}

/** Edits an issue's note / severity. */
export async function updateIssue(id: string, patch: { note?: string; severity?: IssueSeverity }): Promise<Issue | null> {
  const current = getIssue(id);
  if (!current || current.deletedAt) return null;
  const next = IssueSchema.parse({ ...current, ...patch, updatedAt: nowIso() });
  saveIssue(next);
  await afterWrite({ turnoverId: current.turnoverId, skipNotifications: true });
  return next;
}

/** Removes an issue (and its photo). */
export async function deleteIssue(id: string): Promise<void> {
  const current = getIssue(id);
  if (!current || current.deletedAt) return;
  const now = nowIso();
  saveIssue({ ...current, deletedAt: now, updatedAt: now });
  if (current.photoId) await deletePhoto(current.photoId);
  await afterWrite({ turnoverId: current.turnoverId, skipNotifications: true });
}

/**
 * Finishes the turnover. Every room must be complete, or pass `{ force: true, note }` (the shared
 * rule records `forced: true`). On failure `reason` is `rooms-incomplete` (with `incompleteRoomIds`)
 * or `note-required`. Photo uploads continue in the background.
 */
export async function finishTurnover(id: string, opts: { force?: boolean; note?: string } = {}): Promise<TurnoverActionResult> {
  const r = applyTransition(id, (t, p, now) => finish(t, p, now, opts));
  if (r.ok) {
    markLocalRun(id, false);
    await afterWrite({ turnoverId: id });
    kickUploadQueue();
  }
  return r;
}

/** Abandons a scheduled or running turnover (keeps its photos and the time spent). */
export async function abandonTurnover(id: string, note?: string): Promise<TurnoverActionResult> {
  const r = applyTransition(id, (t, _p, now) => abandon(t, now, note));
  if (r.ok) {
    markLocalRun(id, false);
    await afterWrite({ turnoverId: id });
  }
  return r;
}

// ---------------------------------------------------------------------------
// Proof links

export type PublishProofResult =
  | { ok: true; url: string; proof: ProofLink; reused: boolean }
  | {
      ok: false;
      reason: 'not-found' | 'not-finished' | 'signed-out' | 'offline' | 'upload-failed' | 'sync-failed' | 'server';
      message?: string;
      failedUploads?: number;
    };

/**
 * Publishes the public proof page: uploads the turnover's photos (resized, stamp-hashed), pushes the
 * turnover / photo / issue rows, then POST /api/proofs → `https://getturnproof.vercel.app/p/<slug>`
 * (expires after 60 days, revocable). Reuses a live link unless `{ fresh: true }`.
 * `onProgress(done, total)` reports photo uploads.
 */
export async function publishProof(
  turnoverId: string,
  opts: { fresh?: boolean; expiresInDays?: number; onProgress?: (done: number, total: number) => void; signal?: AbortSignal } = {},
): Promise<PublishProofResult> {
  const t = getTurnover(turnoverId);
  if (!t || t.deletedAt) return { ok: false, reason: 'not-found' };
  if (t.status !== 'finished') return { ok: false, reason: 'not-finished' };
  if (!(await isSignedIn())) return { ok: false, reason: 'signed-out' };
  const existing = opts.fresh ? null : currentProof(turnoverId);
  if (existing) return { ok: true, url: existing.url, proof: existing, reused: true };

  const uploads = await uploadTurnoverPhotos(turnoverId, { onProgress: opts.onProgress, signal: opts.signal });
  if (!uploads.ok) {
    if (uploads.reason === 'signed-out' || uploads.reason === 'offline') return { ok: false, reason: uploads.reason };
    return { ok: false, reason: 'upload-failed', failedUploads: uploads.failed, message: uploads.message };
  }
  try {
    await pushDirty();
  } catch (error) {
    return { ok: false, reason: 'sync-failed', message: error instanceof Error ? error.message : String(error) };
  }
  let proof: ProofLink;
  try {
    proof = await createProof(turnoverId, opts.expiresInDays);
  } catch (error) {
    return { ok: false, reason: 'server', message: error instanceof Error ? error.message : String(error) };
  }
  const latest = getTurnover(turnoverId);
  if (latest && latest.proofId !== proof.id) saveTurnover({ ...latest, proofId: proof.id, updatedAt: nowIso() });
  scheduleSync(500);
  return { ok: true, url: proof.url, proof, reused: false };
}

/** Revokes a proof link (the page stops resolving immediately). */
export async function revokeProof(proofId: string): Promise<ProofLink> {
  return revokeProofLink(proofId);
}

// ---------------------------------------------------------------------------
// Settings and danger zone

/** Saves settings (validated). A reminder-lead change re-plans reminders. */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = writeSettings(patch);
  if ('reminderLeadMinutes' in patch) await refreshSurfaces();
  return next;
}

/**
 * Deletes every local row and every stored photo file, cancels reminders and clears the Live
 * Activity / widgets. Server data (account, synced rows, uploaded photos, proofs) is separate:
 * `deleteAccountEverywhere`.
 */
export async function deleteAllLocalData(): Promise<void> {
  await cancelAllTurnoverNotifications();
  wipeAllTables();
  deleteAllPhotoFiles();
  await refreshSurfaces({ skipNotifications: true });
}
