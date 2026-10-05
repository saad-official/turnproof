import type { Issue, Photo, Property, Room, Stamp, Turnover } from "./schemas";

export const CREATED = "2026-10-01T00:00:00.000Z";
export const PROPERTY_ID = "0199b3a0-0000-7000-8000-0000000000a1";
export const TURNOVER_ID = "0199b3a0-0000-7000-8000-0000000000b1";
export const SHA = "a".repeat(64);

/** A UUIDv7-shaped id ending in the given hex digits (unique per number). */
export function uid(n: number): string {
  return `0199b3a0-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
}

/** Sequential string ids for templates: `id-1`, `id-2`, … */
export function counterIds(prefix = "id"): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

export function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "kitchen",
    name: "Kitchen",
    kind: "kitchen",
    items: [
      { id: "counters", label: "Counters", required: true },
      { id: "sink", label: "Sink", required: true },
      { id: "oven", label: "Oven", required: false },
    ],
    requiresAfterPhoto: true,
    ...overrides,
  };
}

export function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: PROPERTY_ID,
    name: "Maple St",
    checkoutTime: "11:00",
    checkinTime: "16:00",
    rooms: [
      makeRoom(),
      makeRoom({
        id: "bath",
        name: "Bathroom",
        kind: "bathroom",
        items: [
          { id: "toilet", label: "Toilet", required: true },
          { id: "towels", label: "Towels restocked", required: true },
        ],
      }),
    ],
    supplies: [],
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

export function makeTurnover(overrides: Partial<Turnover> = {}): Turnover {
  return {
    id: TURNOVER_ID,
    propertyId: PROPERTY_ID,
    scheduledFor: "2026-10-06T15:00:00.000Z",
    status: "scheduled",
    currentRoomIndex: 0,
    roomStates: [],
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

export function makeStamp(overrides: Partial<Stamp> = {}): Stamp {
  return {
    takenAt: "2026-10-06T15:10:00.000Z",
    lat: 43.6532,
    lng: -79.3832,
    accuracyM: 8,
    deviceModel: "Pixel 9",
    sha256: SHA,
    source: "camera",
    ...overrides,
  };
}

export function makePhoto(id: string, overrides: Partial<Photo> = {}): Photo {
  return {
    id,
    turnoverId: TURNOVER_ID,
    roomId: "kitchen",
    phase: "after",
    width: 1600,
    height: 1200,
    stamp: makeStamp(),
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

export function makeIssue(id: string, overrides: Partial<Issue> = {}): Issue {
  return {
    id,
    turnoverId: TURNOVER_ID,
    severity: "medium",
    note: "Scuff on wall",
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}
