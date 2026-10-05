import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";
import { GET as photoFile } from "@/app/api/photos/[id]/file/route";
import { POST as upload } from "@/app/api/photos/[id]/upload/route";
import { POST as createProperty } from "@/app/api/properties/route";
import { POST as joinProperty } from "@/app/api/properties/join/route";
import { POST as publish } from "@/app/api/proofs/route";
import { DELETE as revoke } from "@/app/api/proofs/[id]/route";
import { POST as push } from "@/app/api/sync/push/route";
import type { DbHandle } from "@/lib/db/client";
import { photoBlobs, photos } from "@/lib/db/schema";
import { MAX_PHOTO_BYTES, getPhotoUrl, storageDriver } from "@/lib/storage";
import { jpegBytes, photoRow, propertyRow, sha256Hex, turnoverRow, uuid, webpBytes } from "./fixtures";
import { call, jsonRequest, signUpTestUser, startTestDb, stopTestDb, type TestUser } from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

function rawUpload(who: TestUser | null, photoId: string, body: Uint8Array, contentType = "image/jpeg", sha?: string) {
  const headers = new Headers({ "content-type": contentType });
  if (sha) headers.set("x-content-sha256", sha);
  if (who) headers.set("cookie", who.cookie);
  return call(
    upload,
    new Request(`http://localhost:3900/api/photos/${photoId}/upload`, { method: "POST", headers, body: body as BodyInit }),
    { id: photoId },
  );
}

function multipartUpload(who: TestUser, photoId: string, body: Uint8Array, type = "image/jpeg") {
  const form = new FormData();
  form.set("file", new Blob([body as BlobPart], { type }), "photo.jpg");
  return call(
    upload,
    new Request(`http://localhost:3900/api/photos/${photoId}/upload`, {
      method: "POST",
      headers: { cookie: who.cookie },
      body: form,
    }),
    { id: photoId },
  );
}

function getFile(photoId: string, who?: TestUser) {
  return call(photoFile, jsonRequest(`/api/photos/${photoId}/file`, { cookie: who?.cookie }), { id: photoId });
}

/** Host + cleaner on a property; the cleaner synced a finished turnover with one photo. */
async function syncedPhoto(bytes = jpegBytes(7)) {
  const host = await signUpTestUser("Host");
  const cleaner = await signUpTestUser("Cleaner");
  const propertyId = uuid();
  const created = await createProperty(jsonRequest("/api/properties", { body: { property: propertyRow(propertyId) }, cookie: host.cookie }));
  const { property } = await created.json();
  await joinProperty(jsonRequest("/api/properties/join", { body: { code: property.inviteCode }, cookie: cleaner.cookie }));
  const turnoverId = uuid();
  const photoId = uuid();
  await push(
    jsonRequest("/api/sync/push", {
      body: { tables: { turnovers: [turnoverRow(turnoverId, propertyId)], photos: [photoRow(photoId, turnoverId, { bytes })] } },
      cookie: cleaner.cookie,
    }),
  );
  return { host, cleaner, propertyId, turnoverId, photoId, bytes };
}

describe("storage", () => {
  it("falls back to the Postgres bytea table without a Blob token", () => {
    expect(storageDriver()).toBe("bytea");
    expect(getPhotoUrl("abc")).toBe("/api/photos/abc/file");
    expect(MAX_PHOTO_BYTES).toBe(2 * 1024 * 1024);
  });
});

describe("POST /api/photos/:id/upload", () => {
  it("requires a session", async () => {
    const { photoId, bytes } = await syncedPhoto();
    expect((await rawUpload(null, photoId, bytes)).status).toBe(401);
  });

  it("stores the bytes, records their sha256 and flags a matching stamp", async () => {
    const { cleaner, photoId, bytes } = await syncedPhoto();
    const res = await rawUpload(cleaner, photoId, bytes);
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ id: photoId, bytes: bytes.length, hashMatches: true, remoteUrl: `http://localhost:3900/api/photos/${photoId}/file` });
    const [row] = await handle.db.select().from(photos).where(eq(photos.id, photoId));
    expect(row).toMatchObject({ receivedSha256: sha256Hex(bytes), hashMatches: true, bytes: bytes.length, contentType: "image/jpeg" });
    expect(row?.uploadedAt).toBeInstanceOf(Date);
    const [blob] = await handle.db.select().from(photoBlobs).where(eq(photoBlobs.photoId, photoId));
    expect(Buffer.from(blob!.bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it("accepts multipart form uploads and WEBP", async () => {
    const webp = webpBytes();
    const { cleaner, photoId } = await syncedPhoto(webp);
    const res = await multipartUpload(cleaner, photoId, webp, "image/webp");
    expect(res.status).toBe(200);
    expect(res.json.hashMatches).toBe(true);
  });

  it("refuses bytes that do not match the stamp (409 hash_mismatch) and stores nothing", async () => {
    const { cleaner, photoId } = await syncedPhoto(jpegBytes(1));
    const res = await rawUpload(cleaner, photoId, jpegBytes(2));
    expect([res.status, res.json.code]).toEqual([409, "hash_mismatch"]);
    const [row] = await handle.db.select().from(photos).where(eq(photos.id, photoId));
    expect(row?.uploadedAt).toBeNull();
    expect(await handle.db.select().from(photoBlobs).where(eq(photoBlobs.photoId, photoId))).toEqual([]);
  });

  it("checks the x-content-sha256 header too, and is idempotent", async () => {
    const { cleaner, photoId, bytes } = await syncedPhoto(jpegBytes(4));
    const wrong = await rawUpload(cleaner, photoId, bytes, "image/jpeg", "0".repeat(64));
    expect([wrong.status, wrong.json.code]).toEqual([409, "hash_mismatch"]);
    const first = await rawUpload(cleaner, photoId, bytes, "image/jpeg", sha256Hex(bytes).toUpperCase());
    const second = await rawUpload(cleaner, photoId, bytes, "image/jpeg", sha256Hex(bytes));
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.json.remoteUrl).toBe(first.json.remoteUrl);
  });

  it("answers photo_not_found for a row that is not synced yet", async () => {
    const { cleaner } = await syncedPhoto();
    const res = await rawUpload(cleaner, uuid(), jpegBytes());
    expect([res.status, res.json.code]).toEqual([404, "photo_not_found"]);
  });

  it("only lets the photo's author upload it; strangers get a 404", async () => {
    const { host, photoId, bytes } = await syncedPhoto();
    expect((await rawUpload(host, photoId, bytes)).status).toBe(403);
    expect((await rawUpload(await signUpTestUser(), photoId, bytes)).status).toBe(404);
    expect((await rawUpload(host, uuid(), bytes)).status).toBe(404);
  });

  it("refuses other types, fake JPEGs and bodies over 2 MB", async () => {
    const { cleaner, photoId } = await syncedPhoto();
    expect((await rawUpload(cleaner, photoId, jpegBytes(), "image/png")).status).toBe(415);
    expect((await rawUpload(cleaner, photoId, new TextEncoder().encode("<svg></svg>"), "image/jpeg")).status).toBe(415);
    expect((await rawUpload(cleaner, photoId, new Uint8Array(0))).status).toBe(400);
    const big = jpegBytes(3, MAX_PHOTO_BYTES + 1);
    expect((await rawUpload(cleaner, photoId, big)).status).toBe(413);
  });
});

describe("GET /api/photos/:id/file", () => {
  it("serves members, hides the file from everyone else until a proof is live", async () => {
    const { host, cleaner, turnoverId, photoId, bytes } = await syncedPhoto();
    expect((await getFile(photoId, host)).status).toBe(404);
    await rawUpload(cleaner, photoId, bytes);

    const forHost = await getFile(photoId, host);
    expect(forHost.status).toBe(200);
    expect(forHost.response.headers.get("content-type")).toBe("image/jpeg");
    expect(forHost.response.headers.get("x-robots-tag")).toContain("noindex");
    expect(new Uint8Array(await forHost.response.arrayBuffer())).toEqual(bytes);

    expect((await getFile(photoId)).status).toBe(404);
    const published = await publish(jsonRequest("/api/proofs", { body: { turnoverId }, cookie: cleaner.cookie }));
    const { proof } = await published.json();
    expect((await getFile(photoId)).status).toBe(200);

    await call(revoke, jsonRequest(`/api/proofs/${proof.id}`, { method: "DELETE", cookie: cleaner.cookie }), { id: proof.id });
    expect((await getFile(photoId)).status).toBe(404);
  });
});
