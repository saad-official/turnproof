import "server-only";
import { and, eq, gt, inArray, isNotNull, lte, not, or, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db/client";
import { photos, proofs, turnovers } from "@/lib/db/schema";
import { deletePhoto } from "@/lib/storage";

/**
 * Daily cron (vercel.json, 06:00 UTC).
 *
 * 1. Keep-alive: a trivial query keeps the database warm (Neon's free tier
 *    suspends idle computes).
 * 2. Proof expiry: links stop working at `expires_at` on their own (every
 *    read checks it); the job counts the ones that lapsed in the last day.
 * 3. Upload sweep. Uploaded copies only exist to back a proof link, so the
 *    bytes are deleted (and the photo's upload fields cleared, which tells
 *    the phone to upload again before re-publishing) when:
 *    - the turnover has no live link and its last link ended more than
 *      ENDED_PROOF_GRACE_DAYS ago, or it never had one and the upload is
 *      older than that; or
 *    - the photo or its turnover was soft-deleted more than
 *      DELETED_TURNOVER_GRACE_DAYS ago.
 */
export const ENDED_PROOF_GRACE_DAYS = 7;
export const DELETED_TURNOVER_GRACE_DAYS = 30;
const DAY_MS = 86_400_000;
/** Bounded work per run; the next run picks up the rest. */
const SWEEP_LIMIT = 500;

export type DailyResult = {
  keepAlive: true;
  proofs: { expiredToday: number };
  photos: { deleted: number; errors: number };
};

export async function runDailyJob(options: { now?: Date; db?: Db } = {}): Promise<DailyResult> {
  const now = options.now ?? new Date();
  const db = options.db ?? (await getDb());
  await db.execute(sql`select 1`);
  const expiredToday = await countExpiredToday(db, now);
  const swept = await sweepUploads(db, now);
  return { keepAlive: true, proofs: { expiredToday }, photos: swept };
}

async function countExpiredToday(db: Db, now: Date): Promise<number> {
  const rows = await db
    .select({ id: proofs.id })
    .from(proofs)
    .where(and(lte(proofs.expiresAt, now), gt(proofs.expiresAt, new Date(now.getTime() - DAY_MS)), sql`${proofs.revokedAt} is null`));
  return rows.length;
}

export async function sweepUploads(db: Db, now: Date): Promise<{ deleted: number; errors: number }> {
  const endedBefore = new Date(now.getTime() - ENDED_PROOF_GRACE_DAYS * DAY_MS);
  const deletedBefore = new Date(now.getTime() - DELETED_TURNOVER_GRACE_DAYS * DAY_MS);

  const nowTs = now.toISOString();
  const liveProof = sql`exists (select 1 from ${proofs} p where p.turnover_id = ${photos.turnoverId} and p.revoked_at is null and p.expires_at > ${nowTs}::timestamptz)`;
  const anyProof = sql`exists (select 1 from ${proofs} p where p.turnover_id = ${photos.turnoverId})`;
  const lastEnded = sql`(select max(least(coalesce(p.revoked_at, p.expires_at), p.expires_at)) from ${proofs} p where p.turnover_id = ${photos.turnoverId})`;
  const due = await db
    .select({ id: photos.id, blobPathname: photos.blobPathname })
    .from(photos)
    .innerJoin(turnovers, eq(turnovers.id, photos.turnoverId))
    .where(
      and(
        isNotNull(photos.uploadedAt),
        or(
          sql`coalesce(${photos.deletedAt}, ${turnovers.deletedAt}) <= ${deletedBefore.toISOString()}::timestamptz`,
          and(
            not(liveProof),
            or(and(not(anyProof), lte(photos.uploadedAt, endedBefore)), sql`${lastEnded} <= ${endedBefore.toISOString()}::timestamptz`),
          ),
        ),
      ),
    )
    .limit(SWEEP_LIMIT);

  let deleted = 0;
  let errors = 0;
  const cleared: string[] = [];
  for (const photo of due) {
    try {
      await deletePhoto(db, photo);
      cleared.push(photo.id);
      deleted += 1;
    } catch (error) {
      errors += 1;
      console.error("[cron] photo delete failed", error instanceof Error ? error.message : error);
    }
  }
  if (cleared.length > 0) {
    await db
      .update(photos)
      .set({
        remoteUrl: null,
        blobPathname: null,
        bytes: null,
        contentType: null,
        receivedSha256: null,
        hashMatches: null,
        uploadedAt: null,
        serverUpdatedAt: now,
      })
      .where(inArray(photos.id, cleared));
  }
  return { deleted, errors };
}
