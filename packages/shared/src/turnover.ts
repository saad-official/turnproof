import { nextIncompleteRoomIndex, roomProgress, roomStateFor, turnoverProgress } from "./checklist";
import type { Photo, PhotoPhase, Property, RoomState, Turnover } from "./schemas";
import type { IsoString } from "./tz";

/**
 * Turnover state machine: scheduled → in-progress → finished | abandoned (scheduled may also be abandoned).
 * Every transition is pure: it returns a new turnover plus the events it produced, or `ok: false`
 * with a reason and the input unchanged. It never touches `createdAt` / `updatedAt`; the repository
 * stamps `updatedAt` when it saves.
 */

export type TransitionReason =
  | "not-scheduled"
  | "not-in-progress"
  | "already-closed"
  | "wrong-property"
  | "wrong-turnover"
  | "unknown-room"
  | "room-incomplete"
  | "rooms-incomplete"
  | "note-required"
  | "index-out-of-range"
  | "gallery-not-proof";

export type TurnoverEvent =
  | { type: "started"; at: IsoString }
  | { type: "item-toggled"; roomId: string; itemId: string; checked: boolean }
  | { type: "room-reopened"; roomId: string }
  | { type: "photo-added"; roomId: string; photoId: string; phase: "before" | "after" }
  | { type: "photo-removed"; roomId: string; photoId: string }
  | { type: "room-completed"; roomId: string; at: IsoString }
  | { type: "room-changed"; from: number; to: number }
  | { type: "finished"; at: IsoString; durationSeconds: number; forced: boolean }
  | { type: "abandoned"; at: IsoString };

export type TransitionResult =
  | { ok: true; turnover: Turnover; events: TurnoverEvent[] }
  | { ok: false; reason: TransitionReason; turnover: Turnover; events: []; incompleteRoomIds?: string[] };

const ok = (turnover: Turnover, events: TurnoverEvent[] = []): TransitionResult => ({ ok: true, turnover, events });
const fail = (turnover: Turnover, reason: TransitionReason, extra: { incompleteRoomIds?: string[] } = {}): TransitionResult => ({
  ok: false,
  reason,
  turnover,
  events: [],
  ...extra,
});

const emptyState = (roomId: string): RoomState => ({ roomId, checked: [], beforePhotoIds: [], afterPhotoIds: [] });

function withoutDone(state: RoomState): RoomState {
  const { doneAt: _done, ...rest } = state;
  return rest;
}

function replaceState(t: Turnover, next: RoomState): Turnover {
  const exists = t.roomStates.some((s) => s.roomId === next.roomId);
  const roomStates = exists ? t.roomStates.map((s) => (s.roomId === next.roomId ? next : s)) : [...t.roomStates, next];
  return { ...t, roomStates };
}

function secondsBetween(from: IsoString, to: IsoString): number {
  return Math.max(0, Math.floor((Date.parse(to) - Date.parse(from)) / 1000));
}

/** Begin a scheduled turnover: one room state per property room (existing state kept), first room current. */
export function start(t: Turnover, property: Property, now: IsoString): TransitionResult {
  if (t.status !== "scheduled") return fail(t, "not-scheduled");
  if (property.id !== t.propertyId) return fail(t, "wrong-property");
  const roomStates = property.rooms.map((r) => roomStateFor(t, r.id) ?? emptyState(r.id));
  return ok({ ...t, status: "in-progress", startedAt: now, currentRoomIndex: 0, roomStates }, [{ type: "started", at: now }]);
}

/** Check or uncheck an item. Unchecking an item in a completed room reopens it (clears `doneAt`). */
export function toggleItem(t: Turnover, roomId: string, itemId: string): TransitionResult {
  if (t.status !== "in-progress") return fail(t, "not-in-progress");
  const state = roomStateFor(t, roomId);
  if (!state) return fail(t, "unknown-room");
  const checked = !state.checked.includes(itemId);
  let next: RoomState = { ...state, checked: checked ? [...state.checked, itemId] : state.checked.filter((i) => i !== itemId) };
  const events: TurnoverEvent[] = [{ type: "item-toggled", roomId, itemId, checked }];
  if (!checked && state.doneAt) {
    next = withoutDone(next);
    events.push({ type: "room-reopened", roomId });
  }
  return ok(replaceState(t, next), events);
}

const isRoomPhase = (phase: PhotoPhase): phase is "before" | "after" => phase === "before" || phase === "after";

/**
 * Attach a before/after photo to its room. Issue and reference photos are accepted as no-ops (they are
 * linked through issues or shown as reference only). Gallery images can never be before/after proof.
 */
export function addPhoto(t: Turnover, photo: Photo): TransitionResult {
  if (photo.turnoverId !== t.id) return fail(t, "wrong-turnover");
  if (!isRoomPhase(photo.phase)) return ok(t);
  if (photo.stamp.source !== "camera") return fail(t, "gallery-not-proof");
  if (t.status !== "in-progress") return fail(t, "not-in-progress");
  const state = photo.roomId ? roomStateFor(t, photo.roomId) : undefined;
  if (!state) return fail(t, "unknown-room");
  const key = photo.phase === "before" ? "beforePhotoIds" : "afterPhotoIds";
  if (state[key].includes(photo.id)) return ok(t);
  const next = { ...state, [key]: [...state[key], photo.id] };
  return ok(replaceState(t, next), [{ type: "photo-added", roomId: state.roomId, photoId: photo.id, phase: photo.phase }]);
}

/** Detach a photo (e.g. a retake). Removing a completed room's last after photo reopens it. */
export function removePhoto(t: Turnover, photoId: string): TransitionResult {
  if (t.status !== "in-progress") return fail(t, "not-in-progress");
  const state = t.roomStates.find((s) => s.beforePhotoIds.includes(photoId) || s.afterPhotoIds.includes(photoId));
  if (!state) return ok(t);
  let next: RoomState = {
    ...state,
    beforePhotoIds: state.beforePhotoIds.filter((id) => id !== photoId),
    afterPhotoIds: state.afterPhotoIds.filter((id) => id !== photoId),
  };
  const events: TurnoverEvent[] = [{ type: "photo-removed", roomId: state.roomId, photoId }];
  if (state.doneAt && state.afterPhotoIds.length > 0 && next.afterPhotoIds.length === 0) {
    next = withoutDone(next);
    events.push({ type: "room-reopened", roomId: state.roomId });
  }
  return ok(replaceState(t, next), events);
}

/**
 * Mark a room done (only when `roomProgress(...).complete`), keeping the first `doneAt`, then move the
 * current room to the next incomplete one (wrapping); stays put when none is left.
 */
export function completeRoom(t: Turnover, property: Property, roomId: string, now: IsoString): TransitionResult {
  if (t.status !== "in-progress") return fail(t, "not-in-progress");
  const index = property.rooms.findIndex((r) => r.id === roomId);
  const room = property.rooms[index];
  if (!room) return fail(t, "unknown-room");
  const state = roomStateFor(t, roomId) ?? emptyState(roomId);
  if (!roomProgress(room, state).complete) return fail(t, "room-incomplete");
  const events: TurnoverEvent[] = [];
  let next = t;
  if (!state.doneAt) {
    next = replaceState(t, { ...state, doneAt: now });
    events.push({ type: "room-completed", roomId, at: now });
  }
  const to = nextIncompleteRoomIndex(property, next, index);
  if (to !== null && to !== t.currentRoomIndex) {
    events.push({ type: "room-changed", from: t.currentRoomIndex, to });
    next = { ...next, currentRoomIndex: to };
  }
  return ok(next, events);
}

/** Jump to a room by index (0-based, within the turnover's rooms). */
export function goToRoom(t: Turnover, index: number): TransitionResult {
  if (t.status !== "in-progress") return fail(t, "not-in-progress");
  if (!Number.isInteger(index) || index < 0 || index >= t.roomStates.length) return fail(t, "index-out-of-range");
  if (index === t.currentRoomIndex) return ok(t);
  return ok({ ...t, currentRoomIndex: index }, [{ type: "room-changed", from: t.currentRoomIndex, to: index }]);
}

export interface FinishOptions {
  /** Finish even though some rooms are incomplete; requires a non-blank `note`. */
  force?: boolean;
  note?: string;
}

/**
 * Finish a running turnover. Every room must be complete, or `{ force: true, note }` is required;
 * a forced finish with incomplete rooms sets `forced: true`. Duration is whole seconds from `startedAt`.
 */
export function finish(t: Turnover, property: Property, now: IsoString, options: FinishOptions = {}): TransitionResult {
  if (t.status !== "in-progress" || !t.startedAt) return fail(t, "not-in-progress");
  const progress = turnoverProgress(property, t);
  const note = options.note?.trim();
  const forced = !progress.complete;
  if (forced && !options.force) return fail(t, "rooms-incomplete", { incompleteRoomIds: progress.incompleteRoomIds });
  if (forced && !note) return fail(t, "note-required");
  const durationSeconds = secondsBetween(t.startedAt, now);
  const turnover: Turnover = { ...t, status: "finished", finishedAt: now, durationSeconds, forced, ...(note ? { note } : {}) };
  return ok(turnover, [{ type: "finished", at: now, durationSeconds, forced }]);
}

/** Abandon a scheduled or running turnover; a started one keeps its duration so far. */
export function abandon(t: Turnover, now: IsoString, note?: string): TransitionResult {
  if (t.status === "finished" || t.status === "abandoned") return fail(t, "already-closed");
  const trimmed = note?.trim();
  const turnover: Turnover = {
    ...t,
    status: "abandoned",
    abandonedAt: now,
    ...(t.startedAt ? { durationSeconds: secondsBetween(t.startedAt, now) } : {}),
    ...(trimmed ? { note: trimmed } : {}),
  };
  return ok(turnover, [{ type: "abandoned", at: now }]);
}

/** Seconds worked: 0 before start, live while running, frozen once finished or abandoned. */
export function elapsedSeconds(t: Turnover, now: IsoString): number {
  if (!t.startedAt) return 0;
  if (t.status === "finished") return t.durationSeconds ?? secondsBetween(t.startedAt, t.finishedAt ?? now);
  if (t.status === "abandoned") return secondsBetween(t.startedAt, t.abandonedAt ?? now);
  return secondsBetween(t.startedAt, now);
}
