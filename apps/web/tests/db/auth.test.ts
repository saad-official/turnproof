import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";
import { isApiError } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { GET as health } from "@/app/api/health/route";
import { POST as createProperty } from "@/app/api/properties/route";
import { POST as push } from "@/app/api/sync/push/route";
import { AUTH_COOKIE_PREFIX, getAuth, trustedOrigins } from "@/lib/auth/server";
import type { DbHandle } from "@/lib/db/client";
import { account, devices, properties, propertyMembers, turnovers, user } from "@/lib/db/schema";
import { propertyRow, turnoverRow, uuid } from "./fixtures";
import { jsonRequest, signUpTestUser, startTestDb, stopTestDb } from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

describe("Better Auth on PGlite", () => {
  it("signs up with email + password into the turnproof schema with a hashed password", async () => {
    const created = await signUpTestUser("Ana Ortiz");
    const [stored] = await handle.db.select().from(user).where(eq(user.id, created.id));
    expect(stored).toMatchObject({ name: "Ana Ortiz", email: created.email, emailVerified: false });
    const [credential] = await handle.db.select().from(account).where(eq(account.userId, created.id));
    expect(credential?.providerId).toBe("credential");
    expect(credential?.password).not.toContain("correct horse");
  });

  it("issues session cookies with the turnproof prefix", async () => {
    const created = await signUpTestUser();
    expect(AUTH_COOKIE_PREFIX).toBe("turnproof");
    expect(created.cookie).toContain("turnproof.session_token=");
  });

  it("deleting the account removes owned properties, their turnovers, memberships and devices", async () => {
    const created = await signUpTestUser("Leaving");
    const propertyId = uuid();
    await createProperty(jsonRequest("/api/properties", { body: { property: propertyRow(propertyId) }, cookie: created.cookie }));
    const turnoverId = uuid();
    await push(jsonRequest("/api/sync/push", { body: { tables: { turnovers: [turnoverRow(turnoverId, propertyId)] } }, cookie: created.cookie }));
    expect(await handle.db.select().from(turnovers).where(eq(turnovers.id, turnoverId))).toHaveLength(1);
    await handle.db.insert(devices).values({ userId: created.id, expoPushToken: "ExponentPushToken[leaving]", platform: "ios" });

    const auth = await getAuth();
    await auth.api.deleteUser({ body: { password: "correct horse battery" }, headers: new Headers({ cookie: created.cookie }) });

    expect(await handle.db.select().from(user).where(eq(user.id, created.id))).toEqual([]);
    expect(await handle.db.select().from(properties).where(eq(properties.id, propertyId))).toEqual([]);
    expect(await handle.db.select().from(propertyMembers).where(eq(propertyMembers.userId, created.id))).toEqual([]);
    expect(await handle.db.select().from(turnovers).where(eq(turnovers.id, turnoverId))).toEqual([]);
    expect(await handle.db.select().from(devices).where(eq(devices.userId, created.id))).toEqual([]);
  });

  it("trusts the turnproof:// app scheme and localhost:3900", () => {
    const origins = trustedOrigins();
    expect(origins).toContain("turnproof://");
    expect(origins).toContain("http://localhost:3900");
  });
});

describe("requireUser", () => {
  it("returns the session user for a valid session cookie", async () => {
    const created = await signUpTestUser();
    const sessionUser = await requireUser(jsonRequest("/api/properties", { cookie: created.cookie }));
    expect(sessionUser.id).toBe(created.id);
  });

  it("throws a 401 ApiError without a session", async () => {
    const error = await requireUser(jsonRequest("/api/properties")).catch((e: unknown) => e);
    expect(isApiError(error) && error.status).toBe(401);
  });

  it("throws a 401 ApiError for a forged cookie", async () => {
    const error = await requireUser(
      jsonRequest("/api/properties", { cookie: `${AUTH_COOKIE_PREFIX}.session_token=forged.value` }),
    ).catch((e: unknown) => e);
    expect(isApiError(error) && error.status).toBe(401);
  });
});

describe("GET /api/health", () => {
  it("answers ok with the version and no database", async () => {
    const response = health();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: "turnproof", version: expect.any(String) });
  });
});

describe("account deletion clean-up", () => {
  it("removes the stored bytes of the user's photos before the rows cascade", async () => {
    const { deleteStoredPhotosOf } = await import("@/lib/services/account");
    const { photoBlobs, photos } = await import("@/lib/db/schema");
    const { jpegBytes, photoRow } = await import("./fixtures");
    const { POST: upload } = await import("@/app/api/photos/[id]/upload/route");
    const { call } = await import("./helpers");
    const owner = await signUpTestUser("Owner");
    const propertyId = uuid();
    await createProperty(jsonRequest("/api/properties", { body: { property: propertyRow(propertyId) }, cookie: owner.cookie }));
    const turnoverId = uuid();
    const photoId = uuid();
    const bytes = jpegBytes(3);
    await push(
      jsonRequest("/api/sync/push", {
        body: { tables: { turnovers: [turnoverRow(turnoverId, propertyId)], photos: [photoRow(photoId, turnoverId, { bytes })] } },
        cookie: owner.cookie,
      }),
    );
    await call(
      upload,
      new Request(`http://localhost:3900/api/photos/${photoId}/upload`, {
        method: "POST",
        headers: { "content-type": "image/jpeg", cookie: owner.cookie },
        body: bytes as BodyInit,
      }),
      { id: photoId },
    );
    expect(await handle.db.select().from(photoBlobs).where(eq(photoBlobs.photoId, photoId))).toHaveLength(1);
    expect(await deleteStoredPhotosOf(handle.db, owner.id)).toBe(1);
    expect(await handle.db.select().from(photoBlobs).where(eq(photoBlobs.photoId, photoId))).toEqual([]);
    expect(await handle.db.select().from(photos).where(eq(photos.id, photoId))).toHaveLength(1);
  });
});
