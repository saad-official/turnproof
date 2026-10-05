import { makeStamp, makeTurnover, SHA } from "./fixtures.test-util";
import { isSha256Hex, sameSha256, STAMP_REASON_TEXT, STAMP_WINDOW_MINUTES, stampIsVerified, stampLabel } from "./stamp";

const running = makeTurnover({ status: "in-progress", startedAt: "2026-10-06T15:00:00.000Z" });
const finished = makeTurnover({ status: "finished", startedAt: "2026-10-06T15:00:00.000Z", finishedAt: "2026-10-06T16:00:00.000Z" });

describe("isSha256Hex", () => {
  it("accepts 64 hex characters in either case", () => {
    expect(isSha256Hex(SHA)).toBe(true);
    expect(isSha256Hex("AbC0".repeat(16))).toBe(true);
  });
  it("rejects other lengths, non-hex characters and non-strings", () => {
    expect(isSha256Hex("a".repeat(63))).toBe(false);
    expect(isSha256Hex("a".repeat(65))).toBe(false);
    expect(isSha256Hex("z".repeat(64))).toBe(false);
    expect(isSha256Hex(` ${SHA}`)).toBe(false);
    expect(isSha256Hex(42)).toBe(false);
    expect(isSha256Hex(undefined)).toBe(false);
  });
});

describe("sameSha256", () => {
  it("compares digests case-insensitively", () => {
    expect(sameSha256("ab".repeat(32), "AB".repeat(32))).toBe(true);
    expect(sameSha256("ab".repeat(32), "ac".repeat(32))).toBe(false);
  });
  it("is false when either side is not a digest", () => {
    expect(sameSha256("abc", "abc")).toBe(false);
  });
});

describe("stampIsVerified", () => {
  it("verifies a camera stamp inside the turnover window", () => {
    expect(stampIsVerified(makeStamp(), finished)).toEqual({ verified: true, reasons: [], notes: [] });
  });
  it("rejects gallery imports", () => {
    const r = stampIsVerified(makeStamp({ source: "gallery" }), finished);
    expect(r.verified).toBe(false);
    expect(r.reasons).toContain("not-camera");
  });
  it("rejects an invalid hash", () => {
    expect(stampIsVerified(makeStamp({ sha256: "nope" }), finished).reasons).toContain("invalid-hash");
  });
  it("rejects a hash that does not match the recomputed one", () => {
    expect(stampIsVerified(makeStamp(), finished, { expectedSha256: "b".repeat(64) }).reasons).toContain("hash-mismatch");
    expect(stampIsVerified(makeStamp(), finished, { expectedSha256: "A".repeat(64) }).verified).toBe(true);
  });
  it("allows the grace window either side", () => {
    expect(STAMP_WINDOW_MINUTES).toBe(10);
    expect(stampIsVerified(makeStamp({ takenAt: "2026-10-06T14:50:00.000Z" }), finished).verified).toBe(true);
    expect(stampIsVerified(makeStamp({ takenAt: "2026-10-06T16:10:00.000Z" }), finished).verified).toBe(true);
  });
  it("rejects photos taken before the window", () => {
    expect(stampIsVerified(makeStamp({ takenAt: "2026-10-06T14:49:59.000Z" }), finished).reasons).toEqual(["taken-before-start"]);
  });
  it("rejects photos taken after the window", () => {
    expect(stampIsVerified(makeStamp({ takenAt: "2026-10-06T16:10:01.000Z" }), finished).reasons).toEqual(["taken-after-finish"]);
  });
  it("has no upper bound while the turnover is still running", () => {
    expect(stampIsVerified(makeStamp({ takenAt: "2026-10-06T23:00:00.000Z" }), running).verified).toBe(true);
  });
  it("closes the window at abandonedAt for abandoned turnovers", () => {
    const gone = makeTurnover({ status: "abandoned", startedAt: "2026-10-06T15:00:00.000Z", abandonedAt: "2026-10-06T15:30:00.000Z" });
    expect(stampIsVerified(makeStamp({ takenAt: "2026-10-06T15:45:00.000Z" }), gone).reasons).toEqual(["taken-after-finish"]);
  });
  it("cannot verify against a turnover that never started", () => {
    expect(stampIsVerified(makeStamp(), makeTurnover()).reasons).toEqual(["turnover-not-started"]);
  });
  it("rejects an unparseable capture time", () => {
    expect(stampIsVerified(makeStamp({ takenAt: "yesterday" }), finished).reasons).toContain("invalid-time");
  });
  it("notes missing GPS without failing", () => {
    const r = stampIsVerified(makeStamp({ lat: undefined, lng: undefined }), finished);
    expect(r).toEqual({ verified: true, reasons: [], notes: ["no-gps"] });
  });
  it("skips the GPS note when GPS stamping is off", () => {
    expect(stampIsVerified(makeStamp({ lat: null, lng: null }), finished, { stampGps: false }).notes).toEqual([]);
  });
  it("collects every failing reason", () => {
    const r = stampIsVerified(makeStamp({ source: "gallery", sha256: "x", takenAt: "2026-10-05T00:00:00.000Z" }), finished);
    expect(r.reasons).toEqual(["not-camera", "invalid-hash", "taken-before-start"]);
  });
  it("has text for every reason and note", () => {
    for (const k of ["not-camera", "invalid-hash", "hash-mismatch", "turnover-not-started", "taken-before-start", "taken-after-finish", "invalid-time", "no-gps"]) {
      expect(STAMP_REASON_TEXT[k as keyof typeof STAMP_REASON_TEXT], k).toBeTruthy();
    }
  });
});

describe("stampLabel", () => {
  it("formats time, coordinates and accuracy in the zone", () => {
    expect(stampLabel(makeStamp({ takenAt: "2026-10-06T18:02:00.000Z" }), "America/Toronto", "en-GB")).toBe(
      "Tue 6 Oct, 14:02 · 43.65, −79.38 (±8 m)",
    );
  });
  it("uses the zone's calendar day", () => {
    expect(stampLabel(makeStamp({ takenAt: "2026-10-07T02:30:00.000Z", lat: null, lng: null }), "America/Toronto", "en-GB")).toBe(
      "Tue 6 Oct, 22:30",
    );
  });
  it("omits accuracy when unknown and rounds it otherwise", () => {
    expect(stampLabel(makeStamp({ takenAt: "2026-10-06T18:02:00.000Z", accuracyM: null }), "America/Toronto", "en-GB")).toBe(
      "Tue 6 Oct, 14:02 · 43.65, −79.38",
    );
    expect(stampLabel(makeStamp({ takenAt: "2026-10-06T18:02:00.000Z", accuracyM: 12.6 }), "America/Toronto", "en-GB")).toContain("(±13 m)");
  });
  it("uses a real minus sign for southern and western coordinates only", () => {
    const label = stampLabel(makeStamp({ lat: -33.8688, lng: 151.2093, accuracyM: null }), "UTC", "en-GB");
    expect(label).toContain("−33.87, 151.21");
  });
  it("labels gallery imports", () => {
    expect(stampLabel(makeStamp({ source: "gallery", lat: null, lng: null }), "UTC", "en-GB")).toBe("Tue 6 Oct, 15:10 · From gallery");
  });
  it("defaults to the en-GB style", () => {
    expect(stampLabel(makeStamp({ lat: null, lng: null }), "UTC")).toBe("Tue 6 Oct, 15:10");
  });
});
