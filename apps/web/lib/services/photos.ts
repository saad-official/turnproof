import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { ApiError } from "@/app/api/_lib/respond";
import type { Db } from "@/lib/db/client";
import { photos, properties, propertyMembers, proofs, turnovers } from "@/lib/db/schema";
import { MAX_PHOTO_BYTES, PHOTO_CONTENT_TYPES, putPhoto, readPhoto, type PhotoContentType, type StoredPhoto } from "@/lib/storage";
import { photoFileUrl } from "@/lib/sync/rows";

/**
 * Photo uploads (only done when a proof is about to be published) and the
 * access-checked file route.
 *
 * Upload rules: the photo row must already be synced and live, its property
 * live and the caller a member; only the account that captured it (pushed the
 * row) may upload it. Body: raw `image/jpeg` / `image/webp`, or multipart with
 * a `file` field; at most 2 MB; the bytes must look like the declared type.
 * The sha256 of the bytes received must equal the stamp's (and the
 * `x-content-sha256` header when sent), else 409 `hash_mismatch` and nothing
 * is stored. The server stores the bytes as received (the app strips EXIF
 * before hashing). Re-uploading the same bytes is harmless (idempotent).
 */

export type UploadResult = { id: string; bytes: number; hashMatches: boolean; remoteUrl: string; uploadedAt: string };

function looksLike(bytes: Uint8Array, type: PhotoContentType): boolean {
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  return bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
}

function asPhotoType(value: string | null | undefined): PhotoContentType | null {
  const type = (value ?? "").split(";")[0]!.trim().toLowerCase();
  return (PHOTO_CONTENT_TYPES as readonly string[]).includes(type) ? (type as PhotoContentType) : null;
}

const tooLarge = () => new ApiError(413, "Photos can be at most 2 MB. The app resizes them before upload.", "too_large");
const unsupported = () => new ApiError(415, "Upload a JPEG or WEBP photo.", "unsupported_media_type");

/** Reads the upload body (raw or multipart) with size and type checks. */
export async function readPhotoBody(request: Request): Promise<{ bytes: Uint8Array; contentType: PhotoContentType }> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  // Multipart adds a little framing around the file.
  if (declared > MAX_PHOTO_BYTES + 16 * 1024) throw tooLarge();
  const header = request.headers.get("content-type") ?? "";

  let bytes: Uint8Array;
  let contentType: PhotoContentType | null;
  if (header.toLowerCase().startsWith("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError(400, "Could not read the form upload.", "invalid_body");
    }
    const file = form.get("file");
    if (!(file instanceof Blob)) throw new ApiError(400, "Send the photo in a `file` field.", "invalid_body");
    if (file.size > MAX_PHOTO_BYTES) throw tooLarge();
    contentType = asPhotoType(file.type);
    if (!contentType) throw unsupported();
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    contentType = asPhotoType(header);
    if (!contentType) throw unsupported();
    bytes = new Uint8Array(await request.arrayBuffer());
  }
  if (bytes.length === 0) throw new ApiError(400, "The upload is empty.", "empty_body");
  if (bytes.length > MAX_PHOTO_BYTES) throw tooLarge();
  if (!looksLike(bytes, contentType)) throw unsupported();
  return { bytes, contentType };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** The photo with its property's membership for `userId`; 404 for anything the caller cannot see. */
async function photoForMember(db: Db, photoId: string, userId: string) {
  const [row] = await db
    .select({ photo: photos })
    .from(photos)
    .innerJoin(properties, and(eq(properties.id, photos.propertyId), isNull(properties.deletedAt)))
    .innerJoin(propertyMembers, and(eq(propertyMembers.propertyId, photos.propertyId), eq(propertyMembers.userId, userId)))
    .where(and(eq(photos.id, photoId), isNull(photos.deletedAt)));
  return row?.photo;
}

export async function uploadPhoto(
  db: Db,
  userId: string,
  photoId: string,
  body: { bytes: Uint8Array; contentType: PhotoContentType; declaredSha256?: string | null },
  now = new Date(),
): Promise<UploadResult> {
  const photo = await photoForMember(db, photoId, userId);
  if (!photo) throw new ApiError(404, "Photo not found. Sync it before uploading.", "photo_not_found");
  if (photo.userId !== userId) {
    throw new ApiError(403, "Only the phone that took this photo can upload it.", "forbidden");
  }
  const received = sha256Hex(body.bytes);
  const expected = String((photo.stamp as { sha256?: unknown }).sha256 ?? "").toLowerCase();
  const declared = body.declaredSha256?.trim().toLowerCase();
  if (received !== expected || (declared && declared !== received)) {
    throw new ApiError(409, "The photo does not match the fingerprint recorded when it was taken.", "hash_mismatch");
  }
  const hashMatches = true;
  const { pathname } = await putPhoto(db, photo.id, body.bytes, body.contentType);
  const remoteUrl = photoFileUrl(photo.id);
  await db
    .update(photos)
    .set({
      contentType: body.contentType,
      remoteUrl,
      blobPathname: pathname,
      bytes: body.bytes.length,
      receivedSha256: received,
      hashMatches,
      uploadedAt: now,
      serverUpdatedAt: now,
    })
    .where(eq(photos.id, photo.id));
  return { id: photo.id, bytes: body.bytes.length, hashMatches, remoteUrl, uploadedAt: now.toISOString() };
}

/** True when the photo's turnover has a live (unrevoked, unexpired) proof and is not deleted. */
async function onLiveProof(db: Db, photo: typeof photos.$inferSelect, now: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: proofs.id })
    .from(proofs)
    .innerJoin(turnovers, and(eq(turnovers.id, proofs.turnoverId), isNull(turnovers.deletedAt)))
    .innerJoin(properties, and(eq(properties.id, turnovers.propertyId), isNull(properties.deletedAt)))
    .where(and(eq(proofs.turnoverId, photo.turnoverId), isNull(proofs.revokedAt), gt(proofs.expiresAt, now)))
    .limit(1);
  return !!row;
}

/**
 * The stored bytes, for a member of the photo's property or anyone holding a
 * live proof link to its turnover. Everything else (unknown, deleted, not
 * uploaded, revoked, expired) is the same 404.
 */
export async function photoFileFor(db: Db, photoId: string, userId: string | null, now = new Date()): Promise<StoredPhoto> {
  const notFound = new ApiError(404, "Not found.", "not_found");
  const [photo] = await db
    .select()
    .from(photos)
    .where(and(eq(photos.id, photoId), isNull(photos.deletedAt)));
  if (!photo || !photo.uploadedAt) throw notFound;
  const member = userId ? !!(await photoForMember(db, photoId, userId)) : false;
  if (!member && !(await onLiveProof(db, photo, now))) throw notFound;
  const stored = await readPhoto(db, photo);
  if (!stored) throw notFound;
  return stored;
}
