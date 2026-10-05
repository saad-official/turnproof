import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SyncPullResponseSchema, SyncPushRequestSchema, SyncPushResponseSchema } from "@turnproof/shared/schemas";
import { POST as upload } from "@/app/api/photos/[id]/upload/route";
import { GET as pull } from "@/app/api/sync/pull/route";
import { POST as push } from "@/app/api/sync/push/route";
import type { DbHandle } from "@/lib/db/client";
import { issueRow, jpegBytes, photoRow, propertyRow, sha256Hex, turnoverRow, uuid } from "./fixtures";
import { call, jsonRequest, signUpTestUser, startTestDb, stopTestDb } from "./helpers";

/** The app speaks the shared schemas: what it sends must be accepted, what it pulls must parse without losing rows. */

let handle: DbHandle;

beforeAll(async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

describe("the app's sync contract", () => {
  it("accepts a shared SyncPushRequest and answers a shared SyncPushResponse; pulls parse with SyncPullResponseSchema", async () => {
    const cleaner = await signUpTestUser("Cleaner");
    const propertyId = uuid();
    const turnoverId = uuid();
    const photoId = uuid();
    const bytes = jpegBytes(21);
    const body = SyncPushRequestSchema.parse({
      deviceId: "device-1",
      tables: {
        properties: [{ ...propertyRow(propertyId), inviteCode: null }],
        turnovers: [turnoverRow(turnoverId, propertyId)],
        photos: [{ ...photoRow(photoId, turnoverId, { bytes }), localUri: null }],
        issues: [issueRow(uuid(), turnoverId, { photoId })],
      },
    });
    const pushed = await push(jsonRequest("/api/sync/push", { body, cookie: cleaner.cookie }));
    const pushJson = await pushed.json();
    expect(SyncPushResponseSchema.parse(pushJson).accepted).toBe(4);

    const uploaded = await call(
      upload,
      new Request(`http://localhost:3900/api/photos/${photoId}/upload`, {
        method: "POST",
        headers: { "content-type": "image/jpeg", "x-content-sha256": sha256Hex(bytes), cookie: cleaner.cookie },
        body: bytes as BodyInit,
      }),
      { id: photoId },
    );
    expect(uploaded.json.remoteUrl).toMatch(/^http:\/\/localhost:3900\/api\/photos\//);

    const pulled = await (await pull(jsonRequest("/api/sync/pull", { cookie: cleaner.cookie }))).json();
    const parsed = SyncPullResponseSchema.parse(pulled);
    expect(parsed.tables.properties).toHaveLength(1);
    expect(parsed.tables.turnovers).toHaveLength(1);
    expect(parsed.tables.issues).toHaveLength(1);
    expect(parsed.tables.photos).toHaveLength(1);
    expect(parsed.tables.photos[0]!.remoteUrl).toBe(uploaded.json.remoteUrl);
    expect(parsed.tables.photos[0]!.localUri ?? null).toBeNull();
  });
});
