import "server-only";
import { and, asc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { rowVersion } from "@turnproof/shared/sync";
import type { Db } from "@/lib/db/client";
import { issues, photos, properties, propertyMembers, turnovers, type MemberRole } from "@/lib/db/schema";
import {
  MAX_CLOCK_SKEW_MS,
  PULL_OVERLAP_MS,
  type RejectReason,
  type SyncPullResponse,
  type SyncPushRequest,
  type SyncPushResponse,
  type SyncRejection,
  type SyncTable,
} from "@/lib/sync/contract";
import {
  issueToColumns,
  issueToWire,
  photoToColumns,
  photoToWire,
  propertyToColumns,
  propertyToWire,
  turnoverToColumns,
  turnoverToWire,
} from "@/lib/sync/rows";
import { insertProperty, type SessionPerson } from "./properties";

/** Merge rules and wire shape: lib/sync/contract.ts. */

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Versioned = { updatedAt: string; deletedAt?: string | null };
type StoredVersion = { updatedAt: Date; deletedAt: Date | null };

const storedVersion = (row: StoredVersion) =>
  rowVersion({ id: "", updatedAt: row.updatedAt.toISOString(), deletedAt: row.deletedAt?.toISOString() ?? null });

/** Incoming wins ties (the device re-sending the same row is harmless). */
const incomingWins = (incoming: Versioned, stored: StoredVersion) =>
  rowVersion({ id: "", ...incoming }) >= storedVersion(stored);

/** Per-push cache of the caller's memberships and property state. */
class Access {
  private readonly properties = new Map<string, { member: boolean; deleted: boolean } | null>();
  constructor(
    private readonly tx: Tx,
    private readonly userId: string,
  ) {}

  async property(id: string) {
    if (!this.properties.has(id)) {
      const [row] = await this.tx
        .select({ deletedAt: properties.deletedAt, member: propertyMembers.userId })
        .from(properties)
        .leftJoin(propertyMembers, and(eq(propertyMembers.propertyId, properties.id), eq(propertyMembers.userId, this.userId)))
        .where(eq(properties.id, id));
      this.properties.set(id, row ? { member: row.member !== null, deleted: row.deletedAt !== null } : null);
    }
    return this.properties.get(id)!;
  }

  /** Why the caller may not write under this property, or null when they may. */
  async refuse(propertyId: string): Promise<RejectReason | null> {
    const state = await this.property(propertyId);
    if (!state || !state.member) return "not_member";
    if (state.deleted) return "property_deleted";
    return null;
  }

  created(id: string) {
    this.properties.set(id, { member: true, deleted: false });
  }

  refresh(id: string) {
    this.properties.delete(id);
  }
}

export async function pushChanges(
  db: Db,
  person: SessionPerson,
  body: SyncPushRequest,
  now = new Date(),
): Promise<SyncPushResponse> {
  const limit = now.getTime() + MAX_CLOCK_SKEW_MS;
  const role: MemberRole = body.role ?? "host";
  return db.transaction(async (tx) => {
    const access = new Access(tx, person.id);
    const rejected: SyncRejection[] = [];
    let accepted = 0;
    const reject = (table: SyncTable, id: string, reason: RejectReason) => rejected.push({ table, id, reason });
    const tooNew = (row: Versioned) => rowVersion({ id: "", ...row }) > limit;

    for (const row of body.tables.properties) {
      if (tooNew(row)) {
        reject("properties", row.id, "clock_skew");
        continue;
      }
      const [stored] = await tx.select().from(properties).where(eq(properties.id, row.id));
      if (!stored) {
        await insertProperty(tx, person, row, { role, name: person.name, withInviteCode: false, now });
        access.created(row.id);
        accepted += 1;
        continue;
      }
      const state = await access.property(row.id);
      if (!state?.member) {
        reject("properties", row.id, "not_member");
        continue;
      }
      if (incomingWins(row, stored)) {
        const { id: _id, ...values } = propertyToColumns(row);
        void _id;
        await tx.update(properties).set({ ...values, serverUpdatedAt: now }).where(eq(properties.id, row.id));
        access.refresh(row.id);
      }
      accepted += 1;
    }

    /** Property of each turnover the caller may write under (for issues and photos below). */
    const turnoverProperty = new Map<string, string>();
    const turnoverPropertyOf = async (turnoverId: string): Promise<string | null> => {
      if (!turnoverProperty.has(turnoverId)) {
        const [row] = await tx.select({ propertyId: turnovers.propertyId }).from(turnovers).where(eq(turnovers.id, turnoverId));
        if (!row) return null;
        turnoverProperty.set(turnoverId, row.propertyId);
      }
      return turnoverProperty.get(turnoverId)!;
    };

    for (const row of body.tables.turnovers) {
      if (tooNew(row)) {
        reject("turnovers", row.id, "clock_skew");
        continue;
      }
      const [stored] = await tx.select().from(turnovers).where(eq(turnovers.id, row.id));
      // An existing turnover stays in its property, whatever the push says.
      const propertyId = stored?.propertyId ?? row.propertyId;
      const refusal = await access.refuse(propertyId);
      if (refusal) {
        reject("turnovers", row.id, refusal);
        continue;
      }
      const values = { ...turnoverToColumns({ ...row, propertyId }), serverUpdatedAt: now };
      if (!stored) await tx.insert(turnovers).values({ ...values, userId: person.id });
      else if (incomingWins(row, stored)) await tx.update(turnovers).set(values).where(eq(turnovers.id, row.id));
      turnoverProperty.set(row.id, propertyId);
      accepted += 1;
    }

    const children = [
      { name: "issues" as const, table: issues, rows: body.tables.issues, toColumns: issueToColumns },
      { name: "photos" as const, table: photos, rows: body.tables.photos, toColumns: photoToColumns },
    ];
    for (const { name, table, rows, toColumns } of children) {
      for (const row of rows) {
        if (tooNew(row)) {
          reject(name, row.id, "clock_skew");
          continue;
        }
        const [stored] = await tx
          .select({ turnoverId: table.turnoverId, propertyId: table.propertyId, updatedAt: table.updatedAt, deletedAt: table.deletedAt })
          .from(table)
          .where(eq(table.id, row.id));
        if (stored) {
          const refusal = await access.refuse(stored.propertyId);
          if (refusal) {
            reject(name, row.id, refusal);
            continue;
          }
          if (incomingWins(row, stored)) {
            // Keep the stored parent; upload fields are not part of the column set.
            const values = { ...(toColumns as (r: typeof row) => Record<string, unknown>)(row), turnoverId: stored.turnoverId, serverUpdatedAt: now };
            await tx.update(table).set(values).where(eq(table.id, row.id));
            if (name === "photos") {
              // A re-stamped photo is re-checked against the bytes already received.
              await tx
                .update(photos)
                .set({ hashMatches: sql`${photos.receivedSha256} = ${photos.stamp}->>'sha256'` })
                .where(and(eq(photos.id, row.id), isNotNull(photos.receivedSha256)));
            }
          }
          accepted += 1;
          continue;
        }
        const propertyId = await turnoverPropertyOf(row.turnoverId);
        if (!propertyId) {
          reject(name, row.id, "unknown_turnover");
          continue;
        }
        const refusal = await access.refuse(propertyId);
        if (refusal) {
          reject(name, row.id, refusal);
          continue;
        }
        const values = { ...(toColumns as (r: typeof row) => Record<string, unknown>)(row), propertyId, userId: person.id, serverUpdatedAt: now };
        await tx.insert(table).values(values as typeof table.$inferInsert);
        accepted += 1;
      }
    }

    return { serverTime: now.toISOString(), accepted, rejected };
  });
}

export async function pullChanges(db: Db, userId: string, since: Date | undefined, now = new Date()): Promise<SyncPullResponse> {
  const after = since ?? new Date(0);
  // Deleted properties stay in scope so their tombstones reach members.
  const memberships = await db
    .select({ propertyId: propertyMembers.propertyId })
    .from(propertyMembers)
    .where(eq(propertyMembers.userId, userId));
  const ids = memberships.map((m) => m.propertyId);
  const cursor = new Date(Math.max(after.getTime(), now.getTime() - PULL_OVERLAP_MS)).toISOString();
  if (ids.length === 0) {
    return { serverTime: cursor, tables: { properties: [], turnovers: [], issues: [], photos: [] } };
  }

  const [propertyRows, turnoverRows, issueRows, photoRows] = await Promise.all([
    db
      .select()
      .from(properties)
      .where(and(inArray(properties.id, ids), gt(properties.serverUpdatedAt, after)))
      .orderBy(asc(properties.serverUpdatedAt), asc(properties.id)),
    db
      .select()
      .from(turnovers)
      .where(and(inArray(turnovers.propertyId, ids), gt(turnovers.serverUpdatedAt, after)))
      .orderBy(asc(turnovers.serverUpdatedAt), asc(turnovers.id)),
    db
      .select()
      .from(issues)
      .where(and(inArray(issues.propertyId, ids), gt(issues.serverUpdatedAt, after)))
      .orderBy(asc(issues.serverUpdatedAt), asc(issues.id)),
    db
      .select()
      .from(photos)
      .where(and(inArray(photos.propertyId, ids), gt(photos.serverUpdatedAt, after)))
      .orderBy(asc(photos.serverUpdatedAt), asc(photos.id)),
  ]);

  // The cursor lags the clock (never moving backwards) so a push committing
  // during this pull is re-sent next time rather than skipped.
  return {
    serverTime: cursor,
    tables: {
      properties: propertyRows.map((row) => propertyToWire(row, userId)),
      turnovers: turnoverRows.map(turnoverToWire),
      issues: issueRows.map(issueToWire),
      photos: photoRows.map(photoToWire),
    },
  };
}
