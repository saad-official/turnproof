import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";
import { POST as createProperty } from "@/app/api/properties/route";
import { POST as joinProperty } from "@/app/api/properties/join/route";
import { DELETE as removeMember } from "@/app/api/properties/[id]/members/[userId]/route";
import { GET as pull } from "@/app/api/sync/pull/route";
import { POST as push } from "@/app/api/sync/push/route";
import type { DbHandle } from "@/lib/db/client";
import { photos, properties, propertyMembers, turnovers } from "@/lib/db/schema";
import { T0, T1, T2, issueRow, photoRow, propertyRow, turnoverRow, uuid } from "./fixtures";
import { call, jsonRequest, signUpTestUser, startTestDb, stopTestDb, type TestUser } from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

async function doPush(who: TestUser | null, body: unknown) {
  const response = await push(jsonRequest("/api/sync/push", { body, cookie: who?.cookie }));
  return { status: response.status, json: await response.json() };
}

async function doPull(who: TestUser | null, since?: string) {
  const url = since ? `/api/sync/pull?since=${encodeURIComponent(since)}` : "/api/sync/pull";
  const response = await pull(jsonRequest(url, { cookie: who?.cookie }));
  return { status: response.status, json: await response.json() };
}

/** Host owns a property; cleaner joined it. */
async function sharedProperty() {
  const host = await signUpTestUser("Host");
  const cleaner = await signUpTestUser("Cleaner");
  const propertyId = uuid();
  const created = await createProperty(
    jsonRequest("/api/properties", { body: { property: propertyRow(propertyId) }, cookie: host.cookie }),
  );
  const { property } = await created.json();
  await joinProperty(jsonRequest("/api/properties/join", { body: { code: property.inviteCode }, cookie: cleaner.cookie }));
  return { host, cleaner, propertyId };
}

describe("POST /api/sync/push", () => {
  it("requires a session and a valid body", async () => {
    expect((await doPush(null, { tables: {} })).status).toBe(401);
    const someone = await signUpTestUser();
    expect((await doPush(someone, { tables: { turnovers: [{ id: "not-a-uuid" }] } })).status).toBe(400);
  });

  it("creates a new property from a push, owned by the caller with an invite code", async () => {
    const solo = await signUpTestUser("Solo");
    const propertyId = uuid();
    const res = await doPush(solo, { role: "cleaner", tables: { properties: [propertyRow(propertyId)] } });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ accepted: 1, rejected: [] });
    const [row] = await handle.db.select().from(properties).where(eq(properties.id, propertyId));
    expect(row).toMatchObject({ ownerUserId: solo.id, name: "Maple St" });
    // Not shared until the owner asks for an invite code.
    expect(row?.inviteCode).toBeNull();
    const [member] = await handle.db.select().from(propertyMembers).where(eq(propertyMembers.propertyId, propertyId));
    expect(member).toMatchObject({ userId: solo.id, role: "cleaner" });
  });

  it("accepts a property, its turnover, issue and photos in one push", async () => {
    const { cleaner, propertyId } = await sharedProperty();
    const turnoverId = uuid();
    const issueId = uuid();
    const res = await doPush(cleaner, {
      tables: {
        turnovers: [turnoverRow(turnoverId, propertyId)],
        issues: [issueRow(issueId, turnoverId)],
        photos: [photoRow(uuid(), turnoverId), photoRow(uuid(), turnoverId, { phase: "issue" })],
      },
    });
    expect(res.json).toMatchObject({ accepted: 4, rejected: [] });
    const [turnover] = await handle.db.select().from(turnovers).where(eq(turnovers.id, turnoverId));
    expect(turnover).toMatchObject({ userId: cleaner.id, status: "finished" });
  });

  it("rejects rows for properties the caller is not a member of", async () => {
    const { propertyId } = await sharedProperty();
    const stranger = await signUpTestUser("Stranger");
    const turnoverId = uuid();
    const res = await doPush(stranger, {
      tables: {
        properties: [propertyRow(propertyId, { name: "Hijacked", updatedAt: T2 })],
        turnovers: [turnoverRow(turnoverId, propertyId)],
        photos: [photoRow(uuid(), turnoverId)],
      },
    });
    expect(res.json.accepted).toBe(0);
    expect(res.json.rejected.map((r: { reason: string }) => r.reason)).toEqual(["not_member", "not_member", "unknown_turnover"]);
    const [row] = await handle.db.select().from(properties).where(eq(properties.id, propertyId));
    expect(row?.name).toBe("Maple St");
  });

  it("refuses to move an existing turnover into another property", async () => {
    const first = await sharedProperty();
    const second = await sharedProperty();
    const turnoverId = uuid();
    await doPush(first.cleaner, { tables: { turnovers: [turnoverRow(turnoverId, first.propertyId)] } });
    // The second host is not in the first property, even though they own the target property.
    const res = await doPush(second.host, {
      tables: { turnovers: [turnoverRow(turnoverId, second.propertyId, { updatedAt: T2 })] },
    });
    expect(res.json.rejected).toEqual([{ table: "turnovers", id: turnoverId, reason: "not_member" }]);
  });

  it("rejects photos whose turnover is unknown or belongs to another property", async () => {
    const { cleaner } = await sharedProperty();
    const orphan = uuid();
    const res = await doPush(cleaner, { tables: { photos: [photoRow(orphan, uuid())] } });
    expect(res.json.rejected).toEqual([{ table: "photos", id: orphan, reason: "unknown_turnover" }]);
  });

  it("merges last-write-wins between members, and a newer delete wins", async () => {
    const { host, cleaner, propertyId } = await sharedProperty();
    const turnoverId = uuid();
    await doPush(cleaner, { tables: { turnovers: [turnoverRow(turnoverId, propertyId, { note: "v1", updatedAt: T1 })] } });
    // Older edit from the host loses.
    await doPush(host, { tables: { turnovers: [turnoverRow(turnoverId, propertyId, { note: "old", updatedAt: T0 })] } });
    let [row] = await handle.db.select().from(turnovers).where(eq(turnovers.id, turnoverId));
    expect((row?.data as { note: string }).note).toBe("v1");
    // Newer tombstone from the host wins; the author stays the cleaner.
    await doPush(host, { tables: { turnovers: [turnoverRow(turnoverId, propertyId, { note: "v1", updatedAt: T1, deletedAt: T2 })] } });
    [row] = await handle.db.select().from(turnovers).where(eq(turnovers.id, turnoverId));
    expect(row?.deletedAt?.toISOString()).toBe(T2);
    expect(row?.userId).toBe(cleaner.id);
  });

  it("refuses rows dated more than a day in the future", async () => {
    const { cleaner, propertyId } = await sharedProperty();
    const id = uuid();
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const res = await doPush(cleaner, { tables: { turnovers: [turnoverRow(id, propertyId, { updatedAt: future })] } });
    expect(res.json.rejected).toEqual([{ table: "turnovers", id, reason: "clock_skew" }]);
  });

  it("never lets a push overwrite the server's upload fields", async () => {
    const { cleaner, propertyId } = await sharedProperty();
    const turnoverId = uuid();
    const photoId = uuid();
    await doPush(cleaner, { tables: { turnovers: [turnoverRow(turnoverId, propertyId)], photos: [photoRow(photoId, turnoverId)] } });
    await handle.db.update(photos).set({ remoteUrl: "/api/photos/x/file", hashMatches: true }).where(eq(photos.id, photoId));
    await doPush(cleaner, {
      tables: { photos: [{ ...photoRow(photoId, turnoverId, { updatedAt: T2 }), remoteUrl: null, hashMatches: false }] },
    });
    const [row] = await handle.db.select().from(photos).where(eq(photos.id, photoId));
    expect(row).toMatchObject({ remoteUrl: "/api/photos/x/file", hashMatches: true });
  });

  it("refuses writes under a deleted property", async () => {
    const { host, cleaner, propertyId } = await sharedProperty();
    await handle.db.update(properties).set({ deletedAt: new Date(T2) }).where(eq(properties.id, propertyId));
    const id = uuid();
    const res = await doPush(cleaner, { tables: { turnovers: [turnoverRow(id, propertyId)] } });
    expect(res.json.rejected).toEqual([{ table: "turnovers", id, reason: "property_deleted" }]);
    expect(host).toBeDefined();
  });
});

describe("GET /api/sync/pull", () => {
  it("requires a session and validates since", async () => {
    expect((await doPull(null)).status).toBe(401);
    const someone = await signUpTestUser();
    const bad = await pull(jsonRequest("/api/sync/pull?since=yesterday", { cookie: someone.cookie }));
    expect(bad.status).toBe(400);
  });

  it("gives every member the property's rows, and nothing from other properties", async () => {
    const { host, cleaner, propertyId } = await sharedProperty();
    const other = await sharedProperty();
    const turnoverId = uuid();
    const photoId = uuid();
    await doPush(cleaner, {
      tables: {
        turnovers: [turnoverRow(turnoverId, propertyId)],
        issues: [issueRow(uuid(), turnoverId)],
        photos: [photoRow(photoId, turnoverId)],
      },
    });
    await doPush(other.cleaner, { tables: { turnovers: [turnoverRow(uuid(), other.propertyId)] } });

    const res = await doPull(host);
    expect(res.status).toBe(200);
    const { tables } = res.json;
    expect(tables.properties.map((p: { id: string }) => p.id)).toEqual([propertyId]);
    expect(tables.properties[0].inviteCode).toMatch(/^[A-Z2-9]{8}$/);
    expect((await doPull(cleaner)).json.tables.properties[0].inviteCode).toBeNull();
    expect(tables.turnovers).toHaveLength(1);
    expect(tables.turnovers[0]).toMatchObject({ id: turnoverId, propertyId, userId: cleaner.id, startedAt: T0, finishedAt: T2 });
    expect(tables.issues).toHaveLength(1);
    expect(tables.photos[0]).toMatchObject({ id: photoId, turnoverId, remoteUrl: null, uploadedAt: null, hashMatches: null, userId: cleaner.id });
    expect(tables.photos[0].stamp.source).toBe("camera");
    expect(tables.photos[0]).not.toHaveProperty("localUri");
    expect(tables.photos[0].stamp.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("only returns rows changed after since, tombstones included", async () => {
    const { host, cleaner, propertyId } = await sharedProperty();
    const first = await doPull(host);
    const turnoverId = uuid();
    await doPush(cleaner, { tables: { turnovers: [turnoverRow(turnoverId, propertyId, { deletedAt: T1 })] } });
    // The cursor lags the clock, so the first pull's own rows may come back once more; new rows always do.
    const next = await doPull(host, new Date(Date.parse(first.json.serverTime)).toISOString());
    expect(next.json.tables.turnovers.map((t: { id: string; deletedAt: string }) => [t.id, t.deletedAt])).toEqual([[turnoverId, T1]]);
  });

  it("stops sending a property's rows to someone removed from it", async () => {
    const { host, cleaner, propertyId } = await sharedProperty();
    await call(
      removeMember,
      jsonRequest(`/api/properties/${propertyId}/members/${cleaner.id}`, { method: "DELETE", cookie: host.cookie }),
      { id: propertyId, userId: cleaner.id },
    );
    const res = await doPull(cleaner);
    expect(res.json.tables.properties).toEqual([]);
  });
});
