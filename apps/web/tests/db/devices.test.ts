import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { eq } from "drizzle-orm";
import { POST as register } from "@/app/api/devices/route";
import { DELETE as unregister } from "@/app/api/devices/[token]/route";
import type { DbHandle } from "@/lib/db/client";
import { devices } from "@/lib/db/schema";
import { jsonRequest, signUpTestUser, startTestDb, stopTestDb } from "./helpers";

let handle: DbHandle;

beforeAll(async () => {
  handle = await startTestDb();
}, 60_000);

afterAll(async () => {
  await stopTestDb(handle);
});

let tokenCounter = 0;
function expoToken(): string {
  tokenCounter += 1;
  return `ExponentPushToken[test-device-${tokenCounter}-${Math.random().toString(36).slice(2, 8)}]`;
}

function remove(token: string, cookie?: string) {
  return unregister(jsonRequest(`/api/devices/${encodeURIComponent(token)}`, { method: "DELETE", cookie }), {
    params: Promise.resolve({ token: encodeURIComponent(token) }),
  });
}

async function rowsFor(token: string) {
  return handle.db.select().from(devices).where(eq(devices.expoPushToken, token));
}

describe("POST /api/devices", () => {
  it("requires a session", async () => {
    const response = await register(jsonRequest("/api/devices", { body: { token: expoToken(), platform: "ios" } }));
    expect(response.status).toBe(401);
  });

  it("rejects tokens that are not Expo push tokens", async () => {
    const user = await signUpTestUser();
    const response = await register(
      jsonRequest("/api/devices", { body: { token: "not-a-token", platform: "ios" }, cookie: user.cookie }),
    );
    expect(response.status).toBe(400);
  });

  it("registers a token once and refreshes last_seen_at on repeat", async () => {
    const user = await signUpTestUser();
    const token = expoToken();
    const first = await register(jsonRequest("/api/devices", { body: { token, platform: "android" }, cookie: user.cookie }));
    expect(first.status).toBe(200);
    const [before] = await rowsFor(token);
    expect(before).toMatchObject({ userId: user.id, platform: "android" });

    await new Promise((resolve) => setTimeout(resolve, 5));
    await register(jsonRequest("/api/devices", { body: { token, platform: "android" }, cookie: user.cookie }));
    const after = await rowsFor(token);
    expect(after).toHaveLength(1);
    expect(after[0]!.lastSeenAt.getTime()).toBeGreaterThan(before!.lastSeenAt.getTime());
  });

  it("moves a token to the account that registered it last", async () => {
    const first = await signUpTestUser();
    const second = await signUpTestUser();
    const token = expoToken();
    await register(jsonRequest("/api/devices", { body: { token, platform: "ios" }, cookie: first.cookie }));
    await register(jsonRequest("/api/devices", { body: { token, platform: "ios" }, cookie: second.cookie }));
    const rows = await rowsFor(token);
    expect(rows.map((r) => r.userId)).toEqual([second.id]);
  });
});

describe("DELETE /api/devices/:token", () => {
  it("requires a session", async () => {
    expect((await remove(expoToken())).status).toBe(401);
  });

  it("removes the caller's token", async () => {
    const user = await signUpTestUser();
    const token = expoToken();
    await register(jsonRequest("/api/devices", { body: { token, platform: "ios" }, cookie: user.cookie }));
    const response = await remove(token, user.cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, removed: true });
    expect(await rowsFor(token)).toEqual([]);
  });

  it("does not remove another account's token", async () => {
    const owner = await signUpTestUser();
    const other = await signUpTestUser();
    const token = expoToken();
    await register(jsonRequest("/api/devices", { body: { token, platform: "ios" }, cookie: owner.cookie }));
    const response = await remove(token, other.cookie);
    expect(await response.json()).toEqual({ ok: true, removed: false });
    expect(await rowsFor(token)).toHaveLength(1);
  });
});
