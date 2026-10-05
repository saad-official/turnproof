import type { Issue, Photo, Property, Turnover } from "@turnproof/shared/schemas";
import type { issues, photos, properties, turnovers } from "@/lib/db/schema";
import { publicEnv } from "@/lib/env";
import type { PulledIssue, PulledPhoto, PulledProperty, PulledTurnover } from "./contract";

/**
 * Wire rows <-> table columns. `data` keeps the whole validated wire row
 * (minus device-only `localUri` and server-owned `remoteUrl` / `inviteCode`);
 * the typed columns copy what the server queries. On the way out, the
 * columns win over `data` for timestamps and server-owned fields.
 */

const date = (value: string | null | undefined) => (value ? new Date(value) : null);
const iso = (value: Date | null) => (value ? value.toISOString() : null);

function withoutKeys<T extends object>(row: T, keys: string[]): Record<string, unknown> {
  const out = { ...row } as Record<string, unknown>;
  for (const key of keys) delete out[key];
  return out;
}

const syncColumns = (row: { createdAt: string; updatedAt: string; deletedAt?: string | null }) => ({
  createdAt: new Date(row.createdAt),
  updatedAt: new Date(row.updatedAt),
  deletedAt: date(row.deletedAt),
});

const syncOut = (row: { createdAt: Date; updatedAt: Date; deletedAt: Date | null }) => ({
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  deletedAt: iso(row.deletedAt),
});

export function propertyToColumns(row: Property) {
  return {
    id: row.id,
    name: row.name,
    data: withoutKeys(row, ["inviteCode"]),
    ...syncColumns(row),
  };
}

export function turnoverToColumns(row: Turnover) {
  return {
    id: row.id,
    propertyId: row.propertyId,
    status: row.status,
    startedAt: date(row.startedAt),
    finishedAt: date(row.finishedAt),
    data: { ...row },
    ...syncColumns(row),
  };
}

export function issueToColumns(row: Issue) {
  return { id: row.id, turnoverId: row.turnoverId, data: { ...row }, ...syncColumns(row) };
}

export function photoToColumns(row: Photo) {
  return {
    id: row.id,
    turnoverId: row.turnoverId,
    phase: row.phase,
    stamp: { ...row.stamp },
    data: withoutKeys(row, ["localUri", "remoteUrl"]),
    ...syncColumns(row),
  };
}

export function propertyToWire(row: typeof properties.$inferSelect, viewerId: string): PulledProperty {
  return {
    ...(row.data as unknown as Property),
    ...syncOut(row),
    inviteCode: row.ownerUserId === viewerId ? row.inviteCode : null,
  };
}

export function turnoverToWire(row: typeof turnovers.$inferSelect): PulledTurnover {
  return { ...(row.data as unknown as Turnover), ...syncOut(row), userId: row.userId };
}

export function issueToWire(row: typeof issues.$inferSelect): PulledIssue {
  return { ...(row.data as unknown as Issue), ...syncOut(row), userId: row.userId };
}

/** Absolute URL of a photo's uploaded copy (the file route checks access on every request). */
export function photoFileUrl(photoId: string): string {
  return `${publicEnv.appUrl.replace(/\/+$/, "")}/api/photos/${photoId}/file`;
}

export function photoToWire(row: typeof photos.$inferSelect): PulledPhoto {
  return {
    ...(row.data as unknown as Omit<Photo, "localUri">),
    ...syncOut(row),
    userId: row.userId,
    remoteUrl: row.uploadedAt ? row.remoteUrl : null,
    bytes: row.bytes,
    hashMatches: row.hashMatches,
    uploadedAt: iso(row.uploadedAt),
  };
}
