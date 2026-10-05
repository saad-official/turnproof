import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";
import { POST as upload } from "@/app/api/photos/[id]/upload/route";
import { POST as createProperty } from "@/app/api/properties/route";
import { POST as joinProperty } from "@/app/api/properties/join/route";
import { DELETE as revoke } from "@/app/api/proofs/[id]/route";
import { GET as listProofs, POST as publish } from "@/app/api/proofs/route";
import { GET as publicStatus } from "@/app/api/public/proofs/[slug]/route";
import { POST as push } from "@/app/api/sync/push/route";
import type { DbHandle } from "@/lib/db/client";
import { proofs } from "@/lib/db/schema";
import { PROOF_SLUG_LENGTH, PROOF_TTL_DAYS, loadPublicProof } from "@/lib/services/proofs";
import { T0, T1, T2, issueRow, jpegBytes, photoRow, propertyRow, turnoverRow, uuid } from "./fixtures";
import { call, jsonRequest, signUpTestUser, startTestDb, stopTestDb, type TestUser } from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  delete process.env.BLOB_READ_WRITE_TOKEN;
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

function uploadBytes(who: TestUser, photoId: string, bytes: Uint8Array) {
  return call(
    upload,
    new Request(`http://localhost:3900/api/photos/${photoId}/upload`, {
      method: "POST",
      headers: { "content-type": "image/jpeg", cookie: who.cookie },
      body: bytes as BodyInit,
    }),
    { id: photoId },
  );
}

async function doPublish(who: TestUser | null, body: unknown) {
  const response = await publish(jsonRequest("/api/proofs", { body, cookie: who?.cookie }));
  return { status: response.status, json: await response.json() };
}

async function doList(who: TestUser | null, turnoverId: string) {
  const response = await listProofs(jsonRequest(`/api/proofs?turnoverId=${turnoverId}`, { cookie: who?.cookie }));
  return { status: response.status, json: await response.json() };
}

function doRevoke(who: TestUser | null, id: string) {
  return call(revoke, jsonRequest(`/api/proofs/${id}`, { method: "DELETE", cookie: who?.cookie }), { id });
}

/**
 * A host and cleaner; the cleaner synced a turnover (finished unless
 * overridden) of the bathroom with a camera before + after photo, a gallery
 * reference and an issue with its photo. `upload: false` leaves photos on the
 * phone.
 */
async function turnoverWithPhotos(options: { status?: string; upload?: boolean } = {}) {
  const host = await signUpTestUser("Host");
  const cleaner = await signUpTestUser("Cleaner");
  const propertyId = uuid();
  const created = await createProperty(
    jsonRequest("/api/properties", { body: { property: propertyRow(propertyId) }, cookie: host.cookie }),
  );
  const { property } = await created.json();
  await joinProperty(jsonRequest("/api/properties/join", { body: { code: property.inviteCode }, cookie: cleaner.cookie }));
  const turnoverId = uuid();
  const issueId = uuid();
  const shots = [
    { id: uuid(), bytes: jpegBytes(11), phase: "before" },
    { id: uuid(), bytes: jpegBytes(12), phase: "after" },
    { id: uuid(), bytes: jpegBytes(13), source: "gallery" as const },
    { id: uuid(), bytes: jpegBytes(14), phase: "issue" },
  ];
  const turnover = turnoverRow(turnoverId, propertyId, {
    roomStates: [{ roomId: "bath", checked: ["i1"], beforePhotoIds: [shots[0]!.id], afterPhotoIds: [shots[1]!.id], doneAt: T1 }],
    ...(options.status ? { status: options.status, finishedAt: null, durationSeconds: null } : {}),
  });
  await push(
    jsonRequest("/api/sync/push", {
      body: {
        tables: {
          turnovers: [turnover],
          issues: [issueRow(issueId, turnoverId, { photoId: shots[3]!.id })],
          photos: shots.map(({ id, bytes, ...rest }) => photoRow(id, turnoverId, { bytes, ...rest })),
        },
      },
      cookie: cleaner.cookie,
    }),
  );
  if (options.upload !== false) {
    for (const shot of shots) await uploadBytes(cleaner, shot.id, shot.bytes);
  }
  return { host, cleaner, propertyId, turnoverId, shots };
}

describe("POST /api/proofs", () => {
  it("requires a session and a turnover the caller can see", async () => {
    expect((await doPublish(null, { turnoverId: uuid() })).status).toBe(401);
    const { turnoverId } = await turnoverWithPhotos();
    expect((await doPublish(await signUpTestUser(), { turnoverId })).status).toBe(404);
  });

  it("refuses an unfinished turnover", async () => {
    const { cleaner, turnoverId } = await turnoverWithPhotos({ status: "in-progress" });
    const res = await doPublish(cleaner, { turnoverId });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("turnover_not_finished");
  });

  it("refuses until every photo is uploaded, listing the missing ids", async () => {
    const { cleaner, turnoverId, shots } = await turnoverWithPhotos({ upload: false });
    await uploadBytes(cleaner, shots[0]!.id, shots[0]!.bytes);
    const res = await doPublish(cleaner, { turnoverId });
    expect(res.status).toBe(409);
    expect(res.json.code).toBe("photos_missing");
    expect([...res.json.details.missing].sort()).toEqual(shots.slice(1).map((s) => s.id).sort());
  });

  it(`publishes a ${PROOF_TTL_DAYS}-day link with an unguessable slug, once per turnover`, async () => {
    const { cleaner, host, turnoverId } = await turnoverWithPhotos();
    const res = await doPublish(cleaner, { turnoverId });
    expect(res.status).toBe(201);
    const { proof } = res.json;
    expect(proof.slug).toMatch(new RegExp(`^[a-z0-9]{${PROOF_SLUG_LENGTH}}$`));
    expect(proof.url).toBe(`http://localhost:3900/p/${proof.slug}`);
    expect(proof.state).toBe("active");
    const days = (Date.parse(proof.expiresAt) - Date.parse(proof.publishedAt)) / 86_400_000;
    expect(days).toBe(60);

    const again = await doPublish(host, { turnoverId });
    expect(again.status).toBe(200);
    expect(again.json.proof.id).toBe(proof.id);
  });
});

describe("POST /api/proofs expiresInDays", () => {
  it("sets the expiry from expiresInDays (1 to 365)", async () => {
    const { cleaner, turnoverId } = await turnoverWithPhotos();
    expect((await doPublish(cleaner, { turnoverId, expiresInDays: 0 })).status).toBe(400);
    const res = await doPublish(cleaner, { turnoverId, expiresInDays: 7 });
    expect(res.status).toBe(201);
    expect((Date.parse(res.json.proof.expiresAt) - Date.parse(res.json.proof.publishedAt)) / 86_400_000).toBe(7);
  });
});

describe("GET /api/proofs?turnoverId=", () => {
  it("lists a turnover's proofs for members only", async () => {
    const { cleaner, host, turnoverId } = await turnoverWithPhotos();
    await doPublish(cleaner, { turnoverId });
    const forHost = await doList(host, turnoverId);
    expect(forHost.status).toBe(200);
    expect(forHost.json.proofs).toHaveLength(1);
    expect((await doList(await signUpTestUser(), turnoverId)).status).toBe(404);
    // Without turnoverId: every proof of the caller's properties.
    const all = await listProofs(jsonRequest("/api/proofs", { cookie: host.cookie }));
    expect((await all.json()).proofs.map((p: { turnoverId: string }) => p.turnoverId)).toEqual([turnoverId]);
  });
});

describe("DELETE /api/proofs/:id", () => {
  it("revokes for any member; a new publish then makes a fresh link", async () => {
    const { cleaner, host, turnoverId } = await turnoverWithPhotos();
    const { json } = await doPublish(cleaner, { turnoverId });
    expect((await doRevoke(await signUpTestUser(), json.proof.id)).status).toBe(404);
    const res = await doRevoke(host, json.proof.id);
    expect(res.status).toBe(200);
    expect(res.json.proof.state).toBe("revoked");
    const fresh = await doPublish(cleaner, { turnoverId });
    expect(fresh.status).toBe(201);
    expect(fresh.json.proof.slug).not.toBe(json.proof.slug);
  });
});

describe("public proof", () => {
  it("builds the page model: before/after pairs, verified badges, references, issues; no account details", async () => {
    const { cleaner, turnoverId, shots } = await turnoverWithPhotos();
    const { json } = await doPublish(cleaner, { turnoverId, timezone: "America/Toronto" });
    const view = await loadPublicProof(handle.db, json.proof.slug);
    if (view.state !== "active") throw new Error(`expected active, got ${view.state}`);
    const { model } = view;
    expect(view.timezone).toBe("America/Toronto");
    expect(view.expiresAt).toBe(json.proof.expiresAt);
    expect(model.property).toEqual({ name: "Maple St", address: null });
    const serialised = JSON.stringify(view);
    for (const secret of ["Unit 3", "Lockbox", cleaner.email, cleaner.id, "file:///"]) expect(serialised).not.toContain(secret);
    expect(model.turnover.durationSeconds).toBe(7200);
    const bath = model.rooms.find((r) => r.roomId === "bath")!;
    expect(bath.before.map((p) => [p.id, p.verified, p.url])).toEqual([[shots[0]!.id, true, `/api/photos/${shots[0]!.id}/file`]]);
    expect(bath.after.map((p) => [p.id, p.verified])).toEqual([[shots[1]!.id, true]]);
    expect(bath.references.map((p) => [p.id, p.verified, p.source])).toEqual([[shots[2]!.id, false, "gallery"]]);
    expect(bath.checklist).toMatchObject({ checkedRequired: 1, totalRequired: 1 });
    expect(bath.issues.map((i) => [i.severity, i.photo?.id])).toEqual([["medium", shots[3]!.id]]);
    expect(model.allVerified).toBe(true);
  });

  it("withholds the badge when a photo is re-stamped after its bytes were uploaded", async () => {
    const { cleaner, turnoverId, shots } = await turnoverWithPhotos();
    const { json } = await doPublish(cleaner, { turnoverId });
    const restamped = photoRow(shots[1]!.id, turnoverId, { bytes: jpegBytes(99), phase: "after", updatedAt: T2 });
    await push(jsonRequest("/api/sync/push", { body: { tables: { photos: [restamped] } }, cookie: cleaner.cookie }));
    const view = await loadPublicProof(handle.db, json.proof.slug);
    if (view.state !== "active") throw new Error("expected active");
    expect(view.timezone).toBe("UTC");
    const after = view.model.rooms.find((r) => r.roomId === "bath")!.after[0]!;
    expect([after.id, after.verified, after.reasons]).toEqual([shots[1]!.id, false, ["hash-mismatch"]]);
    expect(view.model.totals.verifiedPhotos).toBe(1);
    expect(view.model.allVerified).toBe(false);
  });

  it("reports expired, revoked and unknown links", async () => {
    const { cleaner, turnoverId } = await turnoverWithPhotos();
    const { json } = await doPublish(cleaner, { turnoverId });
    const later = new Date(Date.parse(json.proof.expiresAt) + 1000);
    expect((await loadPublicProof(handle.db, json.proof.slug, later)).state).toBe("expired");
    await doRevoke(cleaner, json.proof.id);
    expect((await loadPublicProof(handle.db, json.proof.slug)).state).toBe("revoked");
    expect((await loadPublicProof(handle.db, "doesnotexist0000")).state).toBe("not_found");
  });

  it("answers the proxy's status check: 200 active, 410 expired/revoked, 404 unknown", async () => {
    const { cleaner, turnoverId } = await turnoverWithPhotos();
    const { json } = await doPublish(cleaner, { turnoverId });
    const status = (slug: string) => call(publicStatus, jsonRequest(`/api/public/proofs/${slug}`), { slug });
    expect((await status(json.proof.slug)).json).toEqual({ state: "active" });
    await handle.db.update(proofs).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(proofs.id, json.proof.id));
    const expired = await status(json.proof.slug);
    expect([expired.status, expired.json.state]).toEqual([410, "expired"]);
    expect((await status("nope")).status).toBe(404);
  });

  it("treats a deleted turnover's link as revoked", async () => {
    const { cleaner, propertyId, turnoverId } = await turnoverWithPhotos();
    const { json } = await doPublish(cleaner, { turnoverId });
    await push(
      jsonRequest("/api/sync/push", {
        body: { tables: { turnovers: [turnoverRow(turnoverId, propertyId, { updatedAt: T1, deletedAt: T2 })] } },
        cookie: cleaner.cookie,
      }),
    );
    expect((await loadPublicProof(handle.db, json.proof.slug)).state).toBe("revoked");
    expect(T0).toBeDefined();
  });
});
