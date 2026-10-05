import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";
import { GET as listProperties, POST as createProperty } from "@/app/api/properties/route";
import { POST as joinProperty } from "@/app/api/properties/join/route";
import { DELETE as deleteProperty } from "@/app/api/properties/[id]/route";
import { POST as rotateInvite } from "@/app/api/properties/[id]/invite/route";
import { POST as shareProperty } from "@/app/api/properties/[id]/share/route";
import { DELETE as removeMember } from "@/app/api/properties/[id]/members/[userId]/route";
import { POST as push } from "@/app/api/sync/push/route";
import type { DbHandle } from "@/lib/db/client";
import { photos, properties, propertyMembers, turnovers } from "@/lib/db/schema";
import {
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  MAX_MEMBERS,
  generateInviteCode,
  normalizeInviteCode,
} from "@/lib/services/properties";
import { photoRow, propertyRow, turnoverRow, uuid } from "./fixtures";
import { call, jsonRequest, signUpTestUser, startTestDb, stopTestDb, type TestUser } from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

async function create(who: TestUser | null, body: unknown) {
  const response = await createProperty(jsonRequest("/api/properties", { body, cookie: who?.cookie }));
  return { status: response.status, json: await response.json() };
}

async function join(who: TestUser | null, body: unknown) {
  const response = await joinProperty(jsonRequest("/api/properties/join", { body, cookie: who?.cookie }));
  return { status: response.status, json: await response.json() };
}

async function list(who: TestUser | null) {
  const response = await listProperties(jsonRequest("/api/properties", { cookie: who?.cookie }));
  return { status: response.status, json: await response.json() };
}

function remove(who: TestUser | null, id: string, userId: string) {
  return call(removeMember, jsonRequest(`/api/properties/${id}/members/${userId}`, { method: "DELETE", cookie: who?.cookie }), {
    id,
    userId,
  });
}

function destroy(who: TestUser | null, id: string) {
  return call(deleteProperty, jsonRequest(`/api/properties/${id}`, { method: "DELETE", cookie: who?.cookie }), { id });
}

/** A host with a fresh property; returns the invite code. */
async function hostWithProperty(name = "Host") {
  const host = await signUpTestUser(name);
  const id = uuid();
  const created = await create(host, { property: propertyRow(id), displayName: name });
  return { host, id, code: created.json.property.inviteCode as string, created };
}

describe("invite codes", () => {
  it("are 8 characters from an alphabet without 0/O/1/I/L", () => {
    expect(INVITE_CODE_LENGTH).toBe(8);
    expect(INVITE_ALPHABET).not.toMatch(/[01OIL]/);
    for (let i = 0; i < 50; i += 1) {
      const code = generateInviteCode();
      expect(code).toHaveLength(8);
      for (const char of code) expect(INVITE_ALPHABET).toContain(char);
    }
  });

  it("normalise what people type: case, spaces and dashes", () => {
    expect(normalizeInviteCode(" abcd-2345 ")).toBe("ABCD2345");
  });
});

describe("POST /api/properties", () => {
  it("requires a session", async () => {
    expect((await create(null, { property: propertyRow(uuid()) })).status).toBe(401);
  });

  it("rejects an invalid property", async () => {
    const host = await signUpTestUser();
    expect((await create(host, { property: { ...propertyRow(uuid()), name: "" } })).status).toBe(400);
  });

  it("creates the property with an invite code and the caller as its host", async () => {
    const { host, id, created } = await hostWithProperty("Priya");
    expect(created.status).toBe(201);
    expect(created.json.property).toMatchObject({
      propertyId: id,
      name: "Maple St",
      isOwner: true,
      role: "host",
      members: [{ userId: host.id, name: "Priya", role: "host", isMe: true }],
    });
    expect(created.json.property.inviteCode).toMatch(new RegExp(`^[${INVITE_ALPHABET}]{8}$`));
    const [row] = await handle.db.select().from(properties).where(eq(properties.id, id));
    expect(row?.ownerUserId).toBe(host.id);
  });

  it("lets a solo cleaner create a property as the cleaner", async () => {
    const cleaner = await signUpTestUser("Solo");
    const created = await create(cleaner, { property: propertyRow(uuid()), role: "cleaner" });
    expect(created.json.property.role).toBe("cleaner");
  });

  it("is idempotent for the owner and refuses someone else's id", async () => {
    const { host, id } = await hostWithProperty();
    const again = await create(host, { property: propertyRow(id) });
    expect(again.status).toBe(200);
    expect(again.json.property.propertyId).toBe(id);
    const stranger = await signUpTestUser();
    expect((await create(stranger, { property: propertyRow(id) })).status).toBe(409);
  });
});

describe("POST /api/properties/join", () => {
  it("adds a cleaner by code (any case, dashes) without revealing the code; a second join is already_member", async () => {
    const { host, id, code } = await hostWithProperty();
    const cleaner = await signUpTestUser("Marta");
    const typed = `${code.slice(0, 4).toLowerCase()}-${code.slice(4)}`;
    const joined = await join(cleaner, { code: typed, displayName: "Marta" });
    expect(joined.status).toBe(200);
    expect(joined.json.property).toMatchObject({ propertyId: id, isOwner: false, role: "cleaner", inviteCode: null });
    expect(joined.json.property.members.map((m: { userId: string }) => m.userId).sort()).toEqual([host.id, cleaner.id].sort());
    expect(joined.json.property.members.find((m: { isMe: boolean }) => m.isMe).userId).toBe(cleaner.id);
    const again = await join(cleaner, { code });
    expect([again.status, again.json.code]).toEqual([409, "already_member"]);
    const members = await handle.db.select().from(propertyMembers).where(eq(propertyMembers.propertyId, id));
    expect(members).toHaveLength(2);
  });

  it("gives the joiner the opposite role of a cleaner-owner", async () => {
    const cleaner = await signUpTestUser("Solo");
    const created = await create(cleaner, { property: propertyRow(uuid()), role: "cleaner" });
    const host = await signUpTestUser("Owner of the unit");
    const joined = await join(host, { code: created.json.property.inviteCode });
    expect(joined.json.property.role).toBe("host");
  });

  it("404s an unknown code as invite_not_found and 409s the owner", async () => {
    const { host, code } = await hostWithProperty();
    const someone = await signUpTestUser();
    const unknown = await join(someone, { code: "ZZZZ2222" });
    expect([unknown.status, unknown.json.code]).toEqual([404, "invite_not_found"]);
    expect((await join(host, { code })).json.code).toBe("already_member");
    expect((await join(someone, { code: "nope" })).status).toBe(400);
  });

  it(`caps a property at ${MAX_MEMBERS} people`, async () => {
    const { code } = await hostWithProperty();
    for (let i = 1; i < MAX_MEMBERS; i += 1) {
      expect((await join(await signUpTestUser(`C${i}`), { code })).status).toBe(200);
    }
    const late = await join(await signUpTestUser("Late"), { code });
    expect(late.status).toBe(409);
    expect(late.json.code).toBe("property_full");
  });
});

describe("GET /api/properties", () => {
  it("lists the properties the caller is in, with members", async () => {
    const { host, id, code } = await hostWithProperty();
    const cleaner = await signUpTestUser();
    await join(cleaner, { code });
    const forCleaner = await list(cleaner);
    expect(forCleaner.status).toBe(200);
    expect(forCleaner.json.properties.map((p: { propertyId: string }) => p.propertyId)).toEqual([id]);
    const forHost = await list(host);
    expect(forHost.json.properties[0].members).toHaveLength(2);
    expect((await list(await signUpTestUser())).json.properties).toEqual([]);
  });
});

describe("DELETE /api/properties/:id/members/:userId", () => {
  it("lets the owner remove a cleaner and a cleaner leave, never the owner", async () => {
    const { host, id, code } = await hostWithProperty();
    const a = await signUpTestUser("A");
    const b = await signUpTestUser("B");
    await join(a, { code });
    await join(b, { code });

    expect((await remove(a, id, b.id)).status).toBe(403);
    expect((await remove(a, id, host.id)).status).toBe(403);
    expect((await remove(host, id, host.id)).json.code).toBe("owner_cannot_leave");
    expect((await remove(host, id, a.id)).status).toBe(200);
    expect((await remove(b, id, "me")).status).toBe(200);
    expect((await list(a)).json.properties).toEqual([]);
  });

  it("404s a property the caller is not in", async () => {
    const { host, id } = await hostWithProperty();
    const stranger = await signUpTestUser();
    expect((await remove(stranger, id, host.id)).status).toBe(404);
  });
});

describe("DELETE /api/properties/:id", () => {
  it("is owner-only; tombstones the property and removes its turnovers and photos", async () => {
    const { host, id, code } = await hostWithProperty();
    const cleaner = await signUpTestUser();
    await join(cleaner, { code });
    const turnoverId = uuid();
    const photoId = uuid();
    await push(
      jsonRequest("/api/sync/push", {
        body: { tables: { turnovers: [turnoverRow(turnoverId, id)], photos: [photoRow(photoId, turnoverId)] } },
        cookie: cleaner.cookie,
      }),
    );

    expect((await destroy(cleaner, id)).status).toBe(403);
    expect((await destroy(host, id)).status).toBe(200);

    const [row] = await handle.db.select().from(properties).where(eq(properties.id, id));
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect(await handle.db.select().from(turnovers).where(eq(turnovers.propertyId, id))).toEqual([]);
    expect(await handle.db.select().from(photos).where(eq(photos.propertyId, id))).toEqual([]);
    expect((await list(host)).json.properties).toEqual([]);
    expect((await join(await signUpTestUser(), { code })).status).toBe(404);
  });
});

describe("sharing a synced property", () => {
  function share(who: TestUser | null, id: string) {
    return call(shareProperty, jsonRequest(`/api/properties/${id}/share`, { method: "POST", cookie: who?.cookie }), { id });
  }
  function rotate(who: TestUser | null, id: string) {
    return call(rotateInvite, jsonRequest(`/api/properties/${id}/invite`, { method: "POST", cookie: who?.cookie }), { id });
  }

  async function synced() {
    const host = await signUpTestUser("Host");
    const id = uuid();
    await push(jsonRequest("/api/sync/push", { body: { deviceId: "d1", tables: { properties: [propertyRow(id)] } }, cookie: host.cookie }));
    return { host, id };
  }

  it("has no invite code until the owner shares it; sharing is idempotent", async () => {
    const { host, id } = await synced();
    expect((await list(host)).json.properties[0]).toMatchObject({ propertyId: id, role: "host", inviteCode: null });
    const first = await share(host, id);
    expect(first.status).toBe(200);
    expect(first.json.property.inviteCode).toMatch(new RegExp(`^[${INVITE_ALPHABET}]{8}$`));
    expect((await share(host, id)).json.property.inviteCode).toBe(first.json.property.inviteCode);
  });

  it("is owner-only; strangers and unknown ids get a 404", async () => {
    const { host, id } = await synced();
    const { json } = await share(host, id);
    const cleaner = await signUpTestUser();
    await join(cleaner, { code: json.property.inviteCode });
    expect((await share(cleaner, id)).status).toBe(403);
    expect((await rotate(cleaner, id)).status).toBe(403);
    expect((await share(await signUpTestUser(), id)).status).toBe(404);
    expect((await share(host, uuid())).status).toBe(404);
  });

  it("rotates the invite code; the old one stops working", async () => {
    const { host, id } = await synced();
    const old = (await share(host, id)).json.property.inviteCode as string;
    const res = await rotate(host, id);
    expect(res.status).toBe(200);
    expect(res.json.inviteCode).toMatch(/^[A-Z2-9]{8}$/);
    expect(res.json.inviteCode).not.toBe(old);
    expect((await join(await signUpTestUser(), { code: old })).status).toBe(404);
    expect((await join(await signUpTestUser(), { code: res.json.inviteCode })).status).toBe(200);
  });
});
