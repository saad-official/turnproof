import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { PropertySchema } from "@turnproof/shared/schemas";
import { ApiError } from "@/app/api/_lib/respond";
import type { Db } from "@/lib/db/client";
import { MEMBER_ROLES, photos, properties, propertyMembers, proofs, turnovers, type MemberRole } from "@/lib/db/schema";
import { deletePhoto } from "@/lib/storage";
import { propertyToColumns } from "@/lib/sync/rows";

/**
 * Properties and sharing. Every property a signed-in phone syncs is stored
 * with its creator as owner (role `host`) and no invite code. Rules:
 * - the owner shares (`/share`, idempotent) to get an invite code and can
 *   rotate it (`/invite`; the old code stops working);
 * - joining normalises the code, refuses deleted properties (404
 *   `invite_not_found`) and people already in (409 `already_member`), and caps
 *   a property at MAX_MEMBERS people. Joiners get the opposite role of the owner;
 * - the owner removes anyone but themselves; anyone else can only leave
 *   (`userId` may be `me`);
 * - the owner deletes: the row is tombstoned (members' phones drop it), its
 *   turnovers, issues, photos (and stored bytes) and proofs are removed;
 * - a property the caller is not in is a 404, so ids are never confirmed.
 */

/** No 0/O, 1/I/L: codes get read aloud and typed from a screen. 31 symbols, ~39.6 bits per code. */
export const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const INVITE_CODE_LENGTH = 8;
/** People per property, owner included. */
export const MAX_MEMBERS = 10;
const MAX_CODE_ATTEMPTS = 5;
/** Largest multiple of the alphabet size below 256: bytes at or above it are redrawn (no modulo bias). */
const UNBIASED_LIMIT = 256 - (256 % INVITE_ALPHABET.length);

export type RandomBytes = (length: number) => Uint8Array;
const cryptoBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

export function generateInviteCode(random: RandomBytes = cryptoBytes): string {
  let code = "";
  while (code.length < INVITE_CODE_LENGTH) {
    for (const byte of random(INVITE_CODE_LENGTH)) {
      if (byte >= UNBIASED_LIMIT) continue;
      code += INVITE_ALPHABET[byte % INVITE_ALPHABET.length];
      if (code.length === INVITE_CODE_LENGTH) break;
    }
  }
  return code;
}

/** Upper-cases and drops spaces and dashes ("abcd-2345" -> "ABCD2345"). */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}

const displayName = z.string().trim().min(1).max(60);

export const createPropertySchema = z.object({
  property: PropertySchema,
  role: z.enum(MEMBER_ROLES).default("host"),
  displayName: displayName.optional(),
});

export const joinPropertySchema = z.object({
  code: z
    .string()
    .max(32)
    .transform(normalizeInviteCode)
    .pipe(z.string().length(INVITE_CODE_LENGTH).regex(new RegExp(`^[${INVITE_ALPHABET}]+$`), "Not an invite code.")),
  displayName: displayName.optional(),
  /** Defaults to the opposite of the owner's role. */
  role: z.enum(MEMBER_ROLES).optional(),
});

export type MemberView = { userId: string; name: string; role: MemberRole; joinedAt: string; isMe: boolean };
/** The shape the app's `SharedPropertyView` expects. */
export type PropertyView = {
  propertyId: string;
  name: string;
  /** The caller's role on this property. */
  role: MemberRole;
  isOwner: boolean;
  /** Only the owner sees (and shares) the code; null until shared. */
  inviteCode: string | null;
  createdAt: string;
  members: MemberView[];
};

type PropertyRowDb = typeof properties.$inferSelect;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type SessionPerson = { id: string; name: string };

type MemberRow = typeof propertyMembers.$inferSelect;

async function membersOf(db: Db, ids: string[]): Promise<Map<string, MemberRow[]>> {
  const out = new Map<string, MemberRow[]>();
  if (ids.length === 0) return out;
  const rows = await db
    .select()
    .from(propertyMembers)
    .where(inArray(propertyMembers.propertyId, ids))
    .orderBy(asc(propertyMembers.joinedAt), asc(propertyMembers.userId));
  for (const row of rows) out.set(row.propertyId, [...(out.get(row.propertyId) ?? []), row]);
  return out;
}

function toView(row: PropertyRowDb, viewerId: string, members: MemberRow[]): PropertyView {
  const isOwner = row.ownerUserId === viewerId;
  return {
    propertyId: row.id,
    name: row.name,
    role: members.find((m) => m.userId === viewerId)?.role ?? "host",
    isOwner,
    inviteCode: isOwner ? row.inviteCode : null,
    createdAt: row.createdAt.toISOString(),
    members: members.map((m) => ({
      userId: m.userId,
      name: m.displayName,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      isMe: m.userId === viewerId,
    })),
  };
}

async function viewOf(db: Db, row: PropertyRowDb, viewerId: string): Promise<PropertyView> {
  const members = await membersOf(db, [row.id]);
  return toView(row, viewerId, members.get(row.id) ?? []);
}

/**
 * Inserts a property with its owner as first member, optionally with a fresh
 * invite code. Returns undefined when the id already exists. Runs inside the
 * caller's transaction when given one.
 */
export async function insertProperty(
  db: Db | Tx,
  owner: SessionPerson,
  wire: z.infer<typeof PropertySchema>,
  options: { role: MemberRole; name: string; withInviteCode: boolean; now: Date; random?: RandomBytes },
): Promise<PropertyRowDb | undefined> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const [byId] = await db.select({ id: properties.id }).from(properties).where(eq(properties.id, wire.id));
    if (byId) return undefined;
    const [row] = await db
      .insert(properties)
      .values({
        ...propertyToColumns(wire),
        ownerUserId: owner.id,
        inviteCode: options.withInviteCode ? generateInviteCode(options.random ?? cryptoBytes) : null,
        serverUpdatedAt: options.now,
      })
      .onConflictDoNothing()
      .returning();
    if (row) {
      await db.insert(propertyMembers).values({ propertyId: row.id, userId: owner.id, role: options.role, displayName: options.name });
      return row;
    }
    // Conflict on the invite code (or a concurrent insert of the id): try again.
  }
  throw new Error("Could not allocate a unique invite code.");
}

/** POST /api/properties: create (and share) a property from its wire row. */
export async function createProperty(
  db: Db,
  owner: SessionPerson,
  input: z.infer<typeof createPropertySchema>,
  now = new Date(),
): Promise<{ property: PropertyView; created: boolean }> {
  const [existing] = await db.select().from(properties).where(eq(properties.id, input.property.id));
  if (existing) {
    if (existing.ownerUserId !== owner.id || existing.deletedAt) {
      throw new ApiError(409, "A property with this id already exists.", "property_exists");
    }
    return { property: await shareProperty(db, owner.id, existing.id), created: false };
  }
  const row = await db.transaction((tx) =>
    insertProperty(tx, owner, input.property, {
      role: input.role,
      name: input.displayName ?? owner.name,
      withInviteCode: true,
      now,
    }),
  );
  if (!row) return createProperty(db, owner, input, now);
  return { property: await viewOf(db, row, owner.id), created: true };
}

/** Sets a fresh invite code on the property; retries on the (unlikely) collision. */
async function assignInviteCode(db: Db, propertyId: string, random: RandomBytes = cryptoBytes): Promise<string> {
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    const code = generateInviteCode(random);
    const [taken] = await db.select({ id: properties.id }).from(properties).where(eq(properties.inviteCode, code));
    if (taken) continue;
    await db.update(properties).set({ inviteCode: code }).where(eq(properties.id, propertyId));
    return code;
  }
  throw new Error("Could not allocate a unique invite code.");
}

async function requireOwned(db: Db, propertyId: string, userId: string): Promise<PropertyRowDb> {
  const { property } = await requireMembership(db, propertyId, userId);
  if (property.ownerUserId !== userId) {
    throw new ApiError(403, "Only the property owner can share it.", "forbidden");
  }
  return property;
}

/** POST /api/properties/:id/share: the owner's view with an invite code (created on first share). */
export async function shareProperty(db: Db, userId: string, propertyId: string): Promise<PropertyView> {
  let property = await requireOwned(db, propertyId, userId);
  if (!property.inviteCode) {
    await assignInviteCode(db, propertyId);
    [property] = await db.select().from(properties).where(eq(properties.id, propertyId)) as [PropertyRowDb];
  }
  return viewOf(db, property, userId);
}

/** POST /api/properties/:id/invite: a new code; the old one stops working. */
export async function rotateInviteCode(db: Db, userId: string, propertyId: string): Promise<string> {
  await requireOwned(db, propertyId, userId);
  return assignInviteCode(db, propertyId);
}

export async function joinProperty(db: Db, person: SessionPerson, input: z.infer<typeof joinPropertySchema>): Promise<PropertyView> {
  const [row] = await db
    .select()
    .from(properties)
    .where(and(eq(properties.inviteCode, input.code), isNull(properties.deletedAt)));
  if (!row) throw new ApiError(404, "No property has that invite code.", "invite_not_found");
  const members = (await membersOf(db, [row.id])).get(row.id) ?? [];
  if (members.some((m) => m.userId === person.id)) {
    throw new ApiError(409, "You are already in this property.", "already_member");
  }
  if (members.length >= MAX_MEMBERS) {
    throw new ApiError(409, `A property can have up to ${MAX_MEMBERS} people.`, "property_full");
  }
  const ownerRole = members.find((m) => m.userId === row.ownerUserId)?.role ?? "host";
  await db
    .insert(propertyMembers)
    .values({
      propertyId: row.id,
      userId: person.id,
      role: input.role ?? (ownerRole === "host" ? "cleaner" : "host"),
      displayName: input.displayName ?? person.name,
    })
    .onConflictDoNothing();
  return viewOf(db, row, person.id);
}

/** Every live property the user is in, with members. */
export async function listProperties(db: Db, userId: string): Promise<PropertyView[]> {
  const rows = await db
    .select({ property: properties })
    .from(propertyMembers)
    .innerJoin(properties, eq(properties.id, propertyMembers.propertyId))
    .where(and(eq(propertyMembers.userId, userId), isNull(properties.deletedAt)))
    .orderBy(asc(propertyMembers.joinedAt), asc(properties.id));
  const members = await membersOf(
    db,
    rows.map((r) => r.property.id),
  );
  return rows.map(({ property }) => toView(property, userId, members.get(property.id) ?? []));
}

/**
 * The caller's membership of a live property, or a 404 `property_not_found`
 * (also for properties that exist but the caller is not in, or deleted ones).
 */
export async function requireMembership(db: Db, propertyId: string, userId: string) {
  const [row] = await db
    .select({ property: properties, role: propertyMembers.role })
    .from(propertyMembers)
    .innerJoin(properties, eq(properties.id, propertyMembers.propertyId))
    .where(and(eq(propertyMembers.propertyId, propertyId), eq(propertyMembers.userId, userId), isNull(properties.deletedAt)));
  if (!row) throw new ApiError(404, "Property not found.", "property_not_found");
  return row;
}

/** Removes `targetUserId` (or the caller, for `me`). */
export async function removeMember(db: Db, actorId: string, propertyId: string, target: string): Promise<void> {
  const targetUserId = target === "me" ? actorId : target;
  const { property } = await requireMembership(db, propertyId, actorId);
  const isOwner = property.ownerUserId === actorId;
  if (!isOwner && targetUserId !== actorId) {
    throw new ApiError(403, "Only the property owner can remove other people.", "forbidden");
  }
  if (targetUserId === property.ownerUserId) {
    throw new ApiError(409, "The owner cannot leave their own property. Delete it instead.", "owner_cannot_leave");
  }
  const removed = await db
    .delete(propertyMembers)
    .where(and(eq(propertyMembers.propertyId, propertyId), eq(propertyMembers.userId, targetUserId)))
    .returning({ userId: propertyMembers.userId });
  if (removed.length === 0) throw new ApiError(404, "That person is not in this property.", "member_not_found");
}

/**
 * The owner deletes the property everywhere: stored photo bytes first, then
 * turnovers (issues, photos and proofs cascade), then the property row is
 * tombstoned (and its invite code cleared) so members' phones drop it on
 * their next pull. Members stay attached to the tombstone so it reaches them.
 */
export async function deleteProperty(db: Db, actorId: string, propertyId: string, now = new Date()): Promise<void> {
  const { property } = await requireMembership(db, propertyId, actorId);
  if (property.ownerUserId !== actorId) {
    throw new ApiError(403, "Only the property owner can delete it.", "forbidden");
  }
  const stored = await db
    .select({ id: photos.id, blobPathname: photos.blobPathname })
    .from(photos)
    .where(eq(photos.propertyId, propertyId));
  for (const photo of stored) {
    if (photo.blobPathname) await deletePhoto(db, photo);
  }
  const turnoverIds = (await db.select({ id: turnovers.id }).from(turnovers).where(eq(turnovers.propertyId, propertyId))).map(
    (t) => t.id,
  );
  await db.transaction(async (tx) => {
    if (turnoverIds.length > 0) await tx.delete(proofs).where(inArray(proofs.turnoverId, turnoverIds));
    await tx.delete(turnovers).where(eq(turnovers.propertyId, propertyId));
    const data = { ...property.data, deletedAt: now.toISOString(), updatedAt: now.toISOString() };
    await tx
      .update(properties)
      .set({ deletedAt: now, updatedAt: now, serverUpdatedAt: now, inviteCode: null, data })
      .where(eq(properties.id, propertyId));
  });
}
