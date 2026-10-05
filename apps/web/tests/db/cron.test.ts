import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";
import { GET as daily } from "@/app/api/cron/daily/route";
import { POST as upload } from "@/app/api/photos/[id]/upload/route";
import { POST as createProperty } from "@/app/api/properties/route";
import { POST as publish } from "@/app/api/proofs/route";
import { POST as push } from "@/app/api/sync/push/route";
import type { DbHandle } from "@/lib/db/client";
import { photoBlobs, photos, proofs, turnovers } from "@/lib/db/schema";
import { DELETED_TURNOVER_GRACE_DAYS, ENDED_PROOF_GRACE_DAYS, runDailyJob } from "@/lib/services/daily";
import { jpegBytes, photoRow, propertyRow, turnoverRow, uuid } from "./fixtures";
import { call, jsonRequest, signUpTestUser, startTestDb, stopTestDb } from "./helpers";

const SECRET = "cron-test-secret";
const DAY = 86_400_000;
let handle: DbHandle;

beforeAll(async () => {
  process.env.CRON_SECRET = SECRET;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  delete process.env.CRON_SECRET;
  await stopTestDb(handle);
});

function cronRequest(authorization?: string) {
  return jsonRequest("/api/cron/daily", { headers: authorization ? { authorization } : {} });
}

/** A solo cleaner's finished turnover with one uploaded photo; optionally published. */
async function uploadedTurnover(options: { publish?: boolean } = {}) {
  const cleaner = await signUpTestUser("Cleaner");
  const propertyId = uuid();
  await createProperty(jsonRequest("/api/properties", { body: { property: propertyRow(propertyId) }, cookie: cleaner.cookie }));
  const turnoverId = uuid();
  const photoId = uuid();
  const bytes = jpegBytes(5);
  await push(
    jsonRequest("/api/sync/push", {
      body: { tables: { turnovers: [turnoverRow(turnoverId, propertyId)], photos: [photoRow(photoId, turnoverId, { bytes })] } },
      cookie: cleaner.cookie,
    }),
  );
  await call(
    upload,
    new Request(`http://localhost:3900/api/photos/${photoId}/upload`, {
      method: "POST",
      headers: { "content-type": "image/jpeg", cookie: cleaner.cookie },
      body: bytes as BodyInit,
    }),
    { id: photoId },
  );
  let proofId: string | undefined;
  if (options.publish) {
    const res = await publish(jsonRequest("/api/proofs", { body: { turnoverId }, cookie: cleaner.cookie }));
    proofId = (await res.json()).proof.id;
  }
  return { cleaner, propertyId, turnoverId, photoId, proofId };
}

async function stored(photoId: string) {
  const [row] = await handle.db.select().from(photos).where(eq(photos.id, photoId));
  const blobs = await handle.db.select().from(photoBlobs).where(eq(photoBlobs.photoId, photoId));
  return { uploaded: row?.uploadedAt != null && blobs.length === 1, row };
}

describe("GET /api/cron/daily", () => {
  it("rejects requests without the bearer secret", async () => {
    expect((await daily(cronRequest())).status).toBe(401);
    expect((await daily(cronRequest("Bearer wrong"))).status).toBe(401);
  });

  it("runs with the secret and reports the sweep", async () => {
    const response = await daily(cronRequest(`Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, keepAlive: true, proofs: expect.any(Object), photos: expect.any(Object) });
  });
});

describe("runDailyJob", () => {
  it("keeps uploads behind a live proof and fresh uploads awaiting publish", async () => {
    const live = await uploadedTurnover({ publish: true });
    const pending = await uploadedTurnover();
    await runDailyJob({ db: handle.db, now: new Date(Date.now() + DAY) });
    expect((await stored(live.photoId)).uploaded).toBe(true);
    expect((await stored(pending.photoId)).uploaded).toBe(true);
  });

  it(`deletes uploads ${ENDED_PROOF_GRACE_DAYS} days after the turnover's last proof expired or was revoked`, async () => {
    const { photoId, proofId } = await uploadedTurnover({ publish: true });
    const [proof] = await handle.db.select().from(proofs).where(eq(proofs.id, proofId!));
    const justAfter = new Date(proof!.expiresAt.getTime() + 3_600_000);
    let result = await runDailyJob({ db: handle.db, now: justAfter });
    expect(result.proofs.expiredToday).toBeGreaterThanOrEqual(1);
    expect((await stored(photoId)).uploaded).toBe(true);

    result = await runDailyJob({ db: handle.db, now: new Date(proof!.expiresAt.getTime() + (ENDED_PROOF_GRACE_DAYS + 1) * DAY) });
    const after = await stored(photoId);
    expect(after.uploaded).toBe(false);
    expect(after.row).toMatchObject({ remoteUrl: null, blobPathname: null, bytes: null, uploadedAt: null });
    expect(result.photos.deleted).toBeGreaterThanOrEqual(1);
  });

  it("deletes uploads that were never published after the grace period", async () => {
    const { photoId } = await uploadedTurnover();
    await runDailyJob({ db: handle.db, now: new Date(Date.now() + (ENDED_PROOF_GRACE_DAYS + 1) * DAY) });
    expect((await stored(photoId)).uploaded).toBe(false);
  });

  it(`deletes uploads of turnovers soft-deleted more than ${DELETED_TURNOVER_GRACE_DAYS} days ago, even with a live proof`, async () => {
    const { photoId, turnoverId } = await uploadedTurnover({ publish: true });
    const deletedAt = new Date();
    await handle.db.update(turnovers).set({ deletedAt }).where(eq(turnovers.id, turnoverId));
    await runDailyJob({ db: handle.db, now: new Date(deletedAt.getTime() + 10 * DAY) });
    expect((await stored(photoId)).uploaded).toBe(true);
    await runDailyJob({ db: handle.db, now: new Date(deletedAt.getTime() + (DELETED_TURNOVER_GRACE_DAYS + 1) * DAY) });
    expect((await stored(photoId)).uploaded).toBe(false);
  });
});
