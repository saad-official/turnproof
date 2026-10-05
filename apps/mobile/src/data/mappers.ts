// Row ↔ domain mapping. Domain types and validation come from @turnproof/shared; JSON columns are
// validated on write (throws) and on read (a corrupt value degrades instead of crashing a screen).
import {
  type Issue,
  type IssueSeverity,
  newIdFrom,
  type Photo,
  type PhotoPhase,
  type Property,
  type Room,
  RoomSchema,
  type RoomState,
  RoomStateSchema,
  type Stamp,
  StampSchema,
  type Turnover,
  type TurnoverStatus,
} from '@turnproof/shared';
import * as Crypto from 'expo-crypto';

import type { IssueRow, PhotoRow, PropertyRow, ProofRow, TurnoverRow, UploadState } from './schema';

/** New random UUIDv7 (property, turnover, photo, issue ids). */
export function newId(at: number = Date.now()): string {
  return newIdFrom(at, Crypto.getRandomBytes(10));
}

/** Short random id for rooms and checklist items (they live as JSON inside a property row). */
export function newLocalId(): string {
  const bytes = Crypto.getRandomBytes(8);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

type Parser<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };

function parseJson<T>(json: string, schema: Parser<T>, fallback: T, what: string): T {
  try {
    const parsed = schema.safeParse(JSON.parse(json));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through
  }
  console.warn(`[data] invalid ${what} JSON; using a fallback`);
  return fallback;
}

/** Array parser from an element schema: invalid elements are dropped on read, rejected on write. */
function arrayOf<T>(item: Parser<T>): Parser<T[]> & { parse(value: unknown): T[] } {
  const safeParse = (value: unknown): { success: true; data: T[] } | { success: false } => {
    if (!Array.isArray(value)) return { success: false };
    const out: T[] = [];
    for (const v of value) {
      const r = item.safeParse(v);
      if (r.success) out.push(r.data);
    }
    return { success: true, data: out };
  };
  return {
    safeParse,
    parse(value: unknown): T[] {
      if (!Array.isArray(value)) throw new TypeError('Expected an array');
      return value.map((v, i) => {
        const r = item.safeParse(v);
        if (!r.success) throw new TypeError(`Invalid element at index ${i}`);
        return r.data;
      });
    },
  };
}

const RoomsSchema = arrayOf<Room>(RoomSchema);
const RoomStatesSchema = arrayOf<RoomState>(RoomStateSchema);
const SuppliesSchema = arrayOf<string>({
  safeParse: (v: unknown) => (typeof v === 'string' && v.trim() ? { success: true, data: v.trim() } : { success: false }),
});

// ---------------------------------------------------------------------------
// Properties

export function toProperty(r: PropertyRow): Property {
  return {
    id: r.id,
    name: r.name,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    checkoutTime: r.checkoutTime,
    checkinTime: r.checkinTime,
    accessNotes: r.accessNotes,
    rooms: parseJson<Room[]>(r.roomsJson, RoomsSchema, [], 'rooms'),
    supplies: parseJson<string[]>(r.suppliesJson, SuppliesSchema, [], 'supplies'),
    inviteCode: r.inviteCode,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  };
}

export function fromProperty(p: Property): PropertyRow {
  return {
    id: p.id,
    name: p.name,
    address: p.address ?? null,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    checkoutTime: p.checkoutTime,
    checkinTime: p.checkinTime,
    accessNotes: p.accessNotes ?? null,
    roomsJson: JSON.stringify(RoomsSchema.parse(p.rooms)),
    suppliesJson: JSON.stringify(SuppliesSchema.parse(p.supplies)),
    inviteCode: p.inviteCode ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deletedAt: p.deletedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Turnovers

export function toTurnover(r: TurnoverRow): Turnover {
  return {
    id: r.id,
    propertyId: r.propertyId,
    scheduledFor: r.scheduledFor,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    abandonedAt: r.abandonedAt,
    status: r.status as TurnoverStatus,
    currentRoomIndex: r.currentRoomIndex,
    roomStates: parseJson<RoomState[]>(r.roomStatesJson, RoomStatesSchema, [], 'room states'),
    durationSeconds: r.durationSeconds,
    note: r.note,
    forced: r.forced,
    proofId: r.proofId,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  };
}

export function fromTurnover(t: Turnover): TurnoverRow {
  return {
    id: t.id,
    propertyId: t.propertyId,
    scheduledFor: t.scheduledFor,
    startedAt: t.startedAt ?? null,
    finishedAt: t.finishedAt ?? null,
    abandonedAt: t.abandonedAt ?? null,
    status: t.status,
    currentRoomIndex: t.currentRoomIndex,
    roomStatesJson: JSON.stringify(RoomStatesSchema.parse(t.roomStates)),
    durationSeconds: t.durationSeconds ?? null,
    note: t.note ?? null,
    forced: t.forced ?? null,
    proofId: t.proofId ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    deletedAt: t.deletedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Photos

/** A photo as the device knows it: the shared `Photo` plus upload bookkeeping. */
export type LocalPhoto = Photo & {
  uploadState: UploadState;
  uploadAttempts: number;
  uploadError: string | null;
  nextAttemptAt: string | null;
};

const BROKEN_STAMP: Stamp = {
  takenAt: new Date(0).toISOString(),
  deviceModel: 'unknown',
  sha256: '0'.repeat(64),
  source: 'gallery',
};

export function toPhoto(r: PhotoRow): LocalPhoto {
  return {
    id: r.id,
    turnoverId: r.turnoverId,
    roomId: r.roomId,
    phase: r.phase as PhotoPhase,
    localUri: r.localUri,
    remoteUrl: r.remoteUrl,
    width: r.width,
    height: r.height,
    // A corrupt stamp is shown as an unverified gallery stamp, never as a camera capture.
    stamp: parseJson<Stamp>(r.stampJson, StampSchema, BROKEN_STAMP, 'stamp'),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    uploadState: r.uploadState,
    uploadAttempts: r.uploadAttempts,
    uploadError: r.uploadError,
    nextAttemptAt: r.nextAttemptAt,
  };
}

export function fromPhoto(p: Photo | LocalPhoto): PhotoRow {
  const local = p as Partial<LocalPhoto>;
  return {
    id: p.id,
    turnoverId: p.turnoverId,
    roomId: p.roomId ?? null,
    phase: p.phase,
    localUri: p.localUri ?? null,
    remoteUrl: p.remoteUrl ?? null,
    width: p.width,
    height: p.height,
    stampJson: JSON.stringify(StampSchema.parse(p.stamp)),
    uploadState: local.uploadState ?? (p.remoteUrl ? 'uploaded' : 'local'),
    uploadAttempts: local.uploadAttempts ?? 0,
    uploadError: local.uploadError ?? null,
    nextAttemptAt: local.nextAttemptAt ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deletedAt: p.deletedAt ?? null,
  };
}

/** The shared `Photo` (sync wire / report input) without device bookkeeping. */
export function stripLocal(p: LocalPhoto | Photo): Photo {
  const { uploadState: _s, uploadAttempts: _a, uploadError: _e, nextAttemptAt: _n, ...photo } = p as LocalPhoto;
  return photo;
}

// ---------------------------------------------------------------------------
// Issues

export function toIssue(r: IssueRow): Issue {
  return {
    id: r.id,
    turnoverId: r.turnoverId,
    roomId: r.roomId,
    photoId: r.photoId,
    severity: r.severity as IssueSeverity,
    note: r.note,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
  };
}

export function fromIssue(i: Issue): IssueRow {
  return {
    id: i.id,
    turnoverId: i.turnoverId,
    roomId: i.roomId ?? null,
    photoId: i.photoId ?? null,
    severity: i.severity,
    note: i.note,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    deletedAt: i.deletedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Proofs (server-owned, cached)

export type ProofLink = {
  id: string;
  turnoverId: string;
  slug: string;
  /** Public page, e.g. `https://getturnproof.vercel.app/p/<slug>`. */
  url: string;
  publishedAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export const toProofLink = (r: ProofRow): ProofLink => ({
  id: r.id,
  turnoverId: r.turnoverId,
  slug: r.slug,
  url: r.url,
  publishedAt: r.publishedAt,
  expiresAt: r.expiresAt,
  revokedAt: r.revokedAt,
});
