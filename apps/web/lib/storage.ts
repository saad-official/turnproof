import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { photoBlobs } from "@/lib/db/schema";
import { optionalEnv } from "@/lib/env";

/**
 * Where uploaded proof photos live.
 *
 * - `BLOB_READ_WRITE_TOKEN` set: Vercel Blob. Objects are written with a
 *   random suffix and `BLOB_ACCESS` (default `private`; set `public` for a
 *   public store). Their Blob URLs are never handed out.
 * - otherwise: the `photo_blobs` bytea table (development, tests, or a tiny
 *   deployment without Blob). Photos arrive already resized (<= 2 MB).
 *
 * Either way every read goes through `GET /api/photos/:id/file`, which checks
 * access per request (a member of the property, or a live proof link), so
 * revoking or expiring a link really stops the photos being served.
 */

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/webp"] as const;
export type PhotoContentType = (typeof PHOTO_CONTENT_TYPES)[number];

export type StorageDriver = "blob" | "bytea";
const BYTEA_PREFIX = "db:";

export function storageDriver(): StorageDriver {
  return optionalEnv("BLOB_READ_WRITE_TOKEN") ? "blob" : "bytea";
}

function blobAccess(): "public" | "private" {
  return optionalEnv("BLOB_ACCESS") === "public" ? "public" : "private";
}

/** The path the app and the proof page use for a photo (same origin). */
export function getPhotoUrl(photoId: string): string {
  return `/api/photos/${photoId}/file`;
}

/** Stores (or replaces) a photo's bytes. Returns the storage pathname to keep on the photo row. */
export async function putPhoto(
  db: Db,
  photoId: string,
  bytes: Uint8Array,
  contentType: PhotoContentType,
): Promise<{ pathname: string }> {
  if (storageDriver() === "blob") {
    const { put } = await import("@vercel/blob");
    const extension = contentType === "image/webp" ? "webp" : "jpg";
    const result = await put(`photos/${photoId}.${extension}`, Buffer.from(bytes), {
      access: blobAccess(),
      contentType,
      addRandomSuffix: true,
    });
    return { pathname: result.pathname };
  }
  await db
    .insert(photoBlobs)
    .values({ photoId, bytes, contentType })
    .onConflictDoUpdate({ target: photoBlobs.photoId, set: { bytes, contentType, createdAt: new Date() } });
  return { pathname: `${BYTEA_PREFIX}${photoId}` };
}

export type StoredPhoto = { body: ReadableStream<Uint8Array> | Uint8Array; contentType: string };

/** Reads a stored photo, or null when it is gone. */
export async function readPhoto(
  db: Db,
  photo: { id: string; blobPathname: string | null; contentType: string | null },
): Promise<StoredPhoto | null> {
  if (!photo.blobPathname) return null;
  if (photo.blobPathname.startsWith(BYTEA_PREFIX)) {
    const [row] = await db.select().from(photoBlobs).where(eq(photoBlobs.photoId, photo.id));
    return row ? { body: row.bytes, contentType: row.contentType } : null;
  }
  const { get } = await import("@vercel/blob");
  const result = await get(photo.blobPathname, { access: blobAccess() });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  return { body: result.stream, contentType: photo.contentType ?? result.blob.contentType };
}

/** Deletes a photo's stored bytes (no-op when nothing is stored). */
export async function deletePhoto(db: Db, photo: { id: string; blobPathname: string | null }): Promise<void> {
  if (!photo.blobPathname) return;
  if (photo.blobPathname.startsWith(BYTEA_PREFIX)) {
    await db.delete(photoBlobs).where(eq(photoBlobs.photoId, photo.id));
    return;
  }
  const { del } = await import("@vercel/blob");
  await del(photo.blobPathname);
}
