/** Wire-row builders for database tests (shapes from @turnproof/shared/schemas). */
import { createHash } from "node:crypto";

let idCounter = 0;
/** Deterministic, valid v7-shaped UUIDs. */
export function uuid(): string {
  idCounter += 1;
  return `0199b0c4-0000-7000-8000-${String(idCounter).padStart(12, "0")}`;
}

export const T0 = "2026-10-05T08:00:00.000Z";
export const T1 = "2026-10-05T09:00:00.000Z";
export const T2 = "2026-10-05T10:00:00.000Z";

export function propertyRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: "Maple St",
    address: "12 Maple St, Unit 3",
    lat: null,
    lng: null,
    checkoutTime: "11:00",
    checkinTime: "16:00",
    accessNotes: "Lockbox 4821",
    rooms: [
      {
        id: "bath",
        name: "Bathroom",
        kind: "bathroom",
        items: [{ id: "i1", label: "Scrub shower", required: true }],
        requiresAfterPhoto: true,
      },
      {
        id: "bed",
        name: "Bedroom",
        kind: "bedroom",
        items: [{ id: "i2", label: "Fresh linen", required: true }],
        requiresAfterPhoto: true,
      },
    ],
    supplies: ["Toilet paper"],
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    ...overrides,
  };
}

export function turnoverRow(id: string, propertyId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    propertyId,
    scheduledFor: T0,
    startedAt: T0,
    finishedAt: T2,
    abandonedAt: null,
    status: "finished",
    currentRoomIndex: 0,
    roomStates: [{ roomId: "bath", checked: ["i1"], beforePhotoIds: [], afterPhotoIds: [], doneAt: T1 }],
    durationSeconds: 7200,
    note: null,
    forced: false,
    proofId: null,
    createdAt: T0,
    updatedAt: T0,
    deletedAt: null,
    ...overrides,
  };
}

export function issueRow(id: string, turnoverId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    turnoverId,
    roomId: "bath",
    photoId: null,
    severity: "medium",
    note: "Cracked tile by the tub",
    createdAt: T1,
    updatedAt: T1,
    deletedAt: null,
    ...overrides,
  };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** A tiny but real-looking JPEG body (SOI marker + filler + EOI). */
export function jpegBytes(seed = 1, size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  for (let i = 4; i < size - 2; i += 1) bytes[i] = (i * 31 + seed) % 251;
  bytes.set([0xff, 0xd9], size - 2);
  return bytes;
}

/** A minimal WEBP container header. */
export function webpBytes(size = 64): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x52, 0x49, 0x46, 0x46]); // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  return bytes;
}

/**
 * A photo row. `source: "gallery"` makes a reference photo (phase
 * `reference`), as the shared schema requires.
 */
export function photoRow(
  id: string,
  turnoverId: string,
  overrides: Record<string, unknown> & { bytes?: Uint8Array; source?: "camera" | "gallery"; takenAt?: string } = {},
) {
  const { bytes = jpegBytes(), source = "camera", takenAt = T1, ...rest } = overrides;
  return {
    id,
    turnoverId,
    roomId: "bath",
    phase: source === "gallery" ? "reference" : "before",
    localUri: `file:///photos/${id}.jpg`,
    remoteUrl: null,
    width: 1600,
    height: 1200,
    stamp: { takenAt, lat: 43.65, lng: -79.38, accuracyM: 12, deviceModel: "Pixel 9", sha256: sha256Hex(bytes), source },
    createdAt: T1,
    updatedAt: T1,
    deletedAt: null,
    ...rest,
  };
}
