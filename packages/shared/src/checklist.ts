import type { Property, Room, RoomState, Turnover } from "./schemas";

export interface RoomProgress {
  checkedRequired: number;
  totalRequired: number;
  checkedAll: number;
  totalAll: number;
  beforePhotos: number;
  afterPhotos: number;
  /** The room still lacks the "after" photo it requires. */
  needsAfterPhoto: boolean;
  /** All required items checked and, when the room requires it, at least one after photo. */
  complete: boolean;
}

/** Progress of one room. Checked ids no longer in the room's items are ignored. */
export function roomProgress(room: Room, state: RoomState | undefined): RoomProgress {
  const checked = new Set(state?.checked ?? []);
  const required = room.items.filter((i) => i.required);
  const checkedRequired = required.filter((i) => checked.has(i.id)).length;
  const checkedAll = room.items.filter((i) => checked.has(i.id)).length;
  const afterPhotos = state?.afterPhotoIds.length ?? 0;
  const needsAfterPhoto = room.requiresAfterPhoto && afterPhotos === 0;
  return {
    checkedRequired,
    totalRequired: required.length,
    checkedAll,
    totalAll: room.items.length,
    beforePhotos: state?.beforePhotoIds.length ?? 0,
    afterPhotos,
    needsAfterPhoto,
    complete: checkedRequired === required.length && !needsAfterPhoto,
  };
}

/** The turnover's state for a room, if any. */
export function roomStateFor(turnover: Turnover, roomId: string): RoomState | undefined {
  return turnover.roomStates.find((s) => s.roomId === roomId);
}

/** Clamp a room index into the property's rooms (0 when there are none). */
export function clampRoomIndex(property: Property, index: number): number {
  return Math.max(0, Math.min(index, property.rooms.length - 1));
}

/**
 * First incomplete room at or after `fromIndex` (default: the current room), wrapping to the start;
 * null when every room is complete.
 */
export function nextIncompleteRoomIndex(property: Property, turnover: Turnover, fromIndex = turnover.currentRoomIndex): number | null {
  const n = property.rooms.length;
  const start = n === 0 ? 0 : ((fromIndex % n) + n) % n;
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const room = property.rooms[i]!;
    if (!roomProgress(room, roomStateFor(turnover, room.id)).complete) return i;
  }
  return null;
}

export interface TurnoverProgress {
  roomsDone: number;
  roomsTotal: number;
  /** All checklist items (required and optional). */
  itemsDone: number;
  itemsTotal: number;
  requiredDone: number;
  requiredTotal: number;
  beforePhotos: number;
  afterPhotos: number;
  /** Before + after photos. */
  photos: number;
  currentRoomIndex: number;
  currentRoomName: string | null;
  nextIncompleteRoomIndex: number | null;
  incompleteRoomIds: string[];
  /** Every room complete (true for a property without rooms). */
  complete: boolean;
}

/** Totals across the property's rooms in their current order. */
export function turnoverProgress(property: Property, turnover: Turnover): TurnoverProgress {
  const out: TurnoverProgress = {
    roomsDone: 0,
    roomsTotal: property.rooms.length,
    itemsDone: 0,
    itemsTotal: 0,
    requiredDone: 0,
    requiredTotal: 0,
    beforePhotos: 0,
    afterPhotos: 0,
    photos: 0,
    currentRoomIndex: clampRoomIndex(property, turnover.currentRoomIndex),
    currentRoomName: null,
    nextIncompleteRoomIndex: nextIncompleteRoomIndex(property, turnover),
    incompleteRoomIds: [],
    complete: false,
  };
  for (const room of property.rooms) {
    const p = roomProgress(room, roomStateFor(turnover, room.id));
    if (p.complete) out.roomsDone++;
    else out.incompleteRoomIds.push(room.id);
    out.itemsDone += p.checkedAll;
    out.itemsTotal += p.totalAll;
    out.requiredDone += p.checkedRequired;
    out.requiredTotal += p.totalRequired;
    out.beforePhotos += p.beforePhotos;
    out.afterPhotos += p.afterPhotos;
  }
  out.photos = out.beforePhotos + out.afterPhotos;
  out.currentRoomName = property.rooms[out.currentRoomIndex]?.name ?? null;
  out.complete = out.roomsDone === out.roomsTotal;
  return out;
}
