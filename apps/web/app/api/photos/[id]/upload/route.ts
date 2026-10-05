import { errorResponse } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { readPhotoBody, uploadPhoto } from "@/lib/services/photos";

/**
 * Uploads a synced photo's bytes (done right before publishing a proof).
 * Body: raw `image/jpeg` (the app) or `image/webp`, or multipart with a
 * `file` field, at most 2 MB; optional `x-content-sha256: <hex>`. Answer:
 * `{ id, remoteUrl, bytes, hashMatches: true, uploadedAt }`. 404
 * `photo_not_found` (row not synced yet, or not the caller's to see), 403 for
 * a member who did not take it, 409 `hash_mismatch` (bytes differ from the
 * stamp's sha256), 413 too large, 415 not a JPEG/WEBP. Idempotent.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    const body = await readPhotoBody(request);
    const declaredSha256 = request.headers.get("x-content-sha256");
    return Response.json(await uploadPhoto(await getDb(), user.id, id, { ...body, declaredSha256 }));
  } catch (error) {
    return errorResponse(error, "photos upload");
  }
}
