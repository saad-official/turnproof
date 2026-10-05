import "server-only";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { photos, properties } from "@/lib/db/schema";
import { deletePhoto } from "@/lib/storage";

/**
 * Before an account is deleted: remove the stored bytes of every photo that
 * the deletion cascades away (photos the user took, and every photo of the
 * properties they own). Returns how many were removed.
 */
export async function deleteStoredPhotosOf(db: Db, userId: string): Promise<number> {
  const owned = db.select({ id: properties.id }).from(properties).where(eq(properties.ownerUserId, userId));
  const rows = await db
    .select({ id: photos.id, blobPathname: photos.blobPathname })
    .from(photos)
    .where(and(isNotNull(photos.blobPathname), or(eq(photos.userId, userId), inArray(photos.propertyId, owned))));
  for (const row of rows) await deletePhoto(db, row);
  return rows.length;
}
