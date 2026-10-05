import "server-only";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  DEFAULT_PROOF_DAYS,
  PROOF_SLUG_LENGTH as SHARED_SLUG_LENGTH,
  newProofSlug,
  proofExpiry,
  proofState,
  proofUrl,
  type ProofState,
} from "@turnproof/shared/proof";
import { proofModel, type PhotoRef, type ProofModel } from "@turnproof/shared/report";
import type { Issue, Photo, Property, Turnover } from "@turnproof/shared/schemas";
import { stampIsVerified } from "@turnproof/shared/stamp";
import { ApiError } from "@/app/api/_lib/respond";
import type { Db } from "@/lib/db/client";
import { issues, photos, properties, proofs, propertyMembers, turnovers } from "@/lib/db/schema";
import { publicEnv } from "@/lib/env";
import { getPhotoUrl } from "@/lib/storage";
import { issueToWire, photoToWire, propertyToWire, turnoverToWire } from "@/lib/sync/rows";
import { requireMembership } from "./properties";

/**
 * Public proof links (`/p/<slug>`). Publishing needs a finished turnover
 * whose every live photo is uploaded; a turnover has at most one active link
 * at a time (publishing again returns it). Links expire after 60 days and
 * any member of the property can revoke one; revoking and expiry stop the
 * page and its photos being served. A deleted turnover's link reads as revoked.
 */

export const PROOF_TTL_DAYS = DEFAULT_PROOF_DAYS;
export const PROOF_SLUG_LENGTH = SHARED_SLUG_LENGTH;
const MAX_SLUG_ATTEMPTS = 5;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const MAX_PROOF_DAYS = 365;

export const publishProofSchema = z.object({
  turnoverId: z.uuid(),
  /** Link lifetime; default 60 days. */
  expiresInDays: z.number().int().min(1).max(MAX_PROOF_DAYS).optional(),
  /** IANA zone for the page's times (the publisher's device zone). Default UTC. */
  timezone: z.string().max(64).refine(isTimeZone, "Unknown time zone.").optional(),
});

export type ProofView = {
  id: string;
  slug: string;
  url: string;
  turnoverId: string;
  state: ProofState;
  publishedAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

type ProofRow = typeof proofs.$inferSelect;

function toView(row: ProofRow, now: Date): ProofView {
  const expiresAt = row.expiresAt.toISOString();
  const revokedAt = row.revokedAt?.toISOString() ?? null;
  return {
    id: row.id,
    slug: row.slug,
    url: proofUrl(row.slug, publicEnv.appUrl),
    turnoverId: row.turnoverId,
    state: proofState({ expiresAt, revokedAt }, now.toISOString()),
    publishedAt: row.publishedAt.toISOString(),
    expiresAt,
    revokedAt,
  };
}

/** A live turnover the caller can see (member of its live property), or 404. */
async function requireTurnover(db: Db, turnoverId: string, userId: string) {
  const [turnover] = await db
    .select()
    .from(turnovers)
    .where(and(eq(turnovers.id, turnoverId), isNull(turnovers.deletedAt)));
  if (!turnover) throw new ApiError(404, "Turnover not found.", "turnover_not_found");
  await requireMembership(db, turnover.propertyId, userId).catch(() => {
    throw new ApiError(404, "Turnover not found.", "turnover_not_found");
  });
  return turnover;
}

export async function publishProof(
  db: Db,
  userId: string,
  input: z.infer<typeof publishProofSchema>,
  now = new Date(),
): Promise<{ proof: ProofView; created: boolean }> {
  const turnover = await requireTurnover(db, input.turnoverId, userId);
  if (turnover.status !== "finished" || !turnover.finishedAt) {
    throw new ApiError(409, "Finish the turnover before sharing proof.", "turnover_not_finished");
  }
  const live = await db
    .select({ id: photos.id, uploadedAt: photos.uploadedAt })
    .from(photos)
    .where(and(eq(photos.turnoverId, turnover.id), isNull(photos.deletedAt)));
  const missing = live.filter((p) => !p.uploadedAt).map((p) => p.id);
  if (missing.length > 0) {
    throw new ApiError(409, "Upload every photo before publishing.", "photos_missing", { missing });
  }

  const [active] = await db
    .select()
    .from(proofs)
    .where(and(eq(proofs.turnoverId, turnover.id), isNull(proofs.revokedAt), gt(proofs.expiresAt, now)))
    .orderBy(desc(proofs.publishedAt))
    .limit(1);
  if (active) return { proof: toView(active, now), created: false };

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = newProofSlug(crypto.getRandomValues(new Uint8Array(PROOF_SLUG_LENGTH)));
    const [row] = await db
      .insert(proofs)
      .values({
        slug,
        turnoverId: turnover.id,
        publishedBy: userId,
        timezone: input.timezone ?? "UTC",
        publishedAt: now,
        expiresAt: new Date(proofExpiry(now.toISOString(), input.expiresInDays ?? PROOF_TTL_DAYS)),
      })
      .onConflictDoNothing()
      .returning();
    if (row) return { proof: toView(row, now), created: true };
  }
  throw new Error("Could not allocate a unique proof slug.");
}

/** One turnover's proofs, or (no `turnoverId`) every proof of the caller's live properties. */
export async function listProofs(db: Db, userId: string, turnoverId: string | null, now = new Date()): Promise<ProofView[]> {
  if (turnoverId) {
    await requireTurnover(db, turnoverId, userId);
    const rows = await db.select().from(proofs).where(eq(proofs.turnoverId, turnoverId)).orderBy(desc(proofs.publishedAt));
    return rows.map((row) => toView(row, now));
  }
  const rows = await db
    .select({ proof: proofs })
    .from(proofs)
    .innerJoin(turnovers, and(eq(turnovers.id, proofs.turnoverId), isNull(turnovers.deletedAt)))
    .innerJoin(properties, and(eq(properties.id, turnovers.propertyId), isNull(properties.deletedAt)))
    .innerJoin(propertyMembers, and(eq(propertyMembers.propertyId, properties.id), eq(propertyMembers.userId, userId)))
    .orderBy(desc(proofs.publishedAt))
    .limit(500);
  return rows.map((row) => toView(row.proof, now));
}

export async function revokeProof(db: Db, userId: string, proofId: string, now = new Date()): Promise<ProofView> {
  const [row] = await db.select().from(proofs).where(eq(proofs.id, proofId));
  if (!row) throw new ApiError(404, "Proof not found.", "proof_not_found");
  await requireTurnover(db, row.turnoverId, userId).catch(() => {
    throw new ApiError(404, "Proof not found.", "proof_not_found");
  });
  if (row.revokedAt) return toView(row, now);
  const [updated] = await db.update(proofs).set({ revokedAt: now }).where(eq(proofs.id, proofId)).returning();
  return toView(updated!, now);
}

// ---------------------------------------------------------------------------
// The public page
// ---------------------------------------------------------------------------

export type PublicProof =
  | { state: "not_found" }
  | { state: "expired"; expiresAt: string }
  | { state: "revoked"; expiresAt: string }
  | { state: "active"; model: ProofModel; timezone: string; publishedAt: string; expiresAt: string };

/** State only (the proxy's status check): no photo or turnover reads. */
export async function proofStatus(db: Db, slug: string, now = new Date()): Promise<PublicProof["state"]> {
  const [row] = await db
    .select({ proof: proofs, turnoverDeleted: turnovers.deletedAt, propertyDeleted: properties.deletedAt })
    .from(proofs)
    .innerJoin(turnovers, eq(turnovers.id, proofs.turnoverId))
    .innerJoin(properties, eq(properties.id, turnovers.propertyId))
    .where(eq(proofs.slug, slug));
  if (!row) return "not_found";
  if (row.turnoverDeleted || row.propertyDeleted) return "revoked";
  return proofState(
    { expiresAt: row.proof.expiresAt.toISOString(), revokedAt: row.proof.revokedAt?.toISOString() ?? null },
    now.toISOString(),
  );
}

/**
 * Re-checks a photo's badge with the hash of the bytes the server received
 * (the shared model only sees the stamp), and points it at the file route.
 */
function withServerChecks(ref: PhotoRef, turnover: Turnover, photo: Photo, receivedSha256: string | null): PhotoRef {
  const check = stampIsVerified(photo.stamp, turnover, { expectedSha256: receivedSha256 ?? "" });
  return { ...ref, url: getPhotoUrl(ref.id), verified: check.verified, reasons: check.reasons, notes: check.notes };
}

/** Everything the public page shows, or why it shows nothing. Never includes account details. */
export async function loadPublicProof(db: Db, slug: string, now = new Date()): Promise<PublicProof> {
  const [row] = await db
    .select({ proof: proofs, turnover: turnovers, property: properties })
    .from(proofs)
    .innerJoin(turnovers, eq(turnovers.id, proofs.turnoverId))
    .innerJoin(properties, eq(properties.id, turnovers.propertyId))
    .where(eq(proofs.slug, slug));
  if (!row) return { state: "not_found" };
  const expiresAt = row.proof.expiresAt.toISOString();
  if (row.turnover.deletedAt || row.property.deletedAt) return { state: "revoked", expiresAt };
  const state = proofState({ expiresAt, revokedAt: row.proof.revokedAt?.toISOString() ?? null }, now.toISOString());
  if (state !== "active") return { state, expiresAt };

  const [photoRows, issueRows] = await Promise.all([
    db.select().from(photos).where(and(eq(photos.turnoverId, row.turnover.id), isNull(photos.deletedAt))),
    db.select().from(issues).where(and(eq(issues.turnoverId, row.turnover.id), isNull(issues.deletedAt))),
  ]);
  const property = propertyToWire(row.property, "") as Property;
  const turnover = turnoverToWire(row.turnover) as Turnover;
  const photoWire = photoRows.map((p) => photoToWire(p) as unknown as Photo);
  const received = new Map(photoRows.map((p) => [p.id, p.receivedSha256]));
  const byId = new Map(photoWire.map((p) => [p.id, p]));
  const timezone = row.proof.timezone;

  const base = proofModel(property, turnover, photoWire, issueRows.map(issueToWire) as Issue[], timezone);
  const fix = (ref: PhotoRef) => withServerChecks(ref, turnover, byId.get(ref.id)!, received.get(ref.id) ?? null);
  const rooms = base.rooms.map((room) => ({
    ...room,
    before: room.before.map(fix),
    after: room.after.map(fix),
    references: room.references.map(fix),
    issues: room.issues.map((issue) => ({ ...issue, photo: issue.photo ? fix(issue.photo) : null })),
  }));
  const generalIssues = base.generalIssues.map((issue) => ({ ...issue, photo: issue.photo ? fix(issue.photo) : null }));
  const proofPhotos = rooms.flatMap((r) => [...r.before, ...r.after]);
  const verifiedPhotos = proofPhotos.filter((p) => p.verified).length;
  const model: ProofModel = {
    ...base,
    rooms,
    generalIssues,
    totals: { ...base.totals, verifiedPhotos },
    allVerified: proofPhotos.length > 0 && verifiedPhotos === proofPhotos.length,
  };
  return { state: "active", model, timezone, publishedAt: row.proof.publishedAt.toISOString(), expiresAt };
}
