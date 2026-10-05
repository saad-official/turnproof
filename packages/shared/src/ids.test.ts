import { hashBytes, idFromKey, isUuid, newIdFrom, uuidV7Timestamp } from "./ids";

const ZERO = new Uint8Array(10);
const ONES = new Uint8Array(10).fill(0xff);

describe("isUuid", () => {
  it("accepts a lowercase v4 uuid", () => {
    expect(isUuid("3b241101-e2bb-4255-8caf-4136c566a962")).toBe(true);
  });
  it("accepts an uppercase v7 uuid", () => {
    expect(isUuid("0190163D-8694-739B-AEA5-966C26F8AD91")).toBe(true);
  });
  it("rejects non-strings", () => {
    expect(isUuid(42)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
  it("rejects malformed strings", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("3b241101e2bb42558caf4136c566a962")).toBe(false);
    expect(isUuid("3b241101-e2bb-4255-8caf-4136c566a96")).toBe(false);
    expect(isUuid("zb241101-e2bb-4255-8caf-4136c566a962")).toBe(false);
  });
  it("rejects a wrong variant nibble", () => {
    expect(isUuid("3b241101-e2bb-4255-0caf-4136c566a962")).toBe(false);
  });
});

describe("newIdFrom", () => {
  it("formats a deterministic UUIDv7 from a timestamp and 10 random bytes", () => {
    expect(newIdFrom(0x017f22e279b0, ZERO)).toBe("017f22e2-79b0-7000-8000-000000000000");
  });
  it("masks version and variant bits when random bytes are all ones", () => {
    expect(newIdFrom(0x017f22e279b0, ONES)).toBe("017f22e2-79b0-7fff-bfff-ffffffffffff");
  });
  it("produces a valid uuid", () => {
    expect(isUuid(newIdFrom(Date.UTC(2026, 9, 5), ONES))).toBe(true);
  });
  it("sorts lexicographically by timestamp", () => {
    const a = newIdFrom(1_000, ONES);
    const b = newIdFrom(2_000, ZERO);
    expect(a < b).toBe(true);
  });
  it("throws when fewer than 10 random bytes are given", () => {
    expect(() => newIdFrom(1, new Uint8Array(9))).toThrow(RangeError);
  });
  it("throws for a negative, fractional or >48-bit timestamp", () => {
    expect(() => newIdFrom(-1, ZERO)).toThrow(RangeError);
    expect(() => newIdFrom(1.5, ZERO)).toThrow(RangeError);
    expect(() => newIdFrom(2 ** 48, ZERO)).toThrow(RangeError);
  });
});

describe("uuidV7Timestamp", () => {
  it("round-trips the timestamp from newIdFrom", () => {
    const ms = Date.UTC(2026, 9, 5, 12, 30);
    expect(uuidV7Timestamp(newIdFrom(ms, ONES))).toBe(ms);
  });
  it("returns null for a non-v7 uuid", () => {
    expect(uuidV7Timestamp("3b241101-e2bb-4255-8caf-4136c566a962")).toBeNull();
  });
});

describe("hashBytes", () => {
  it("returns 16 deterministic bytes for a string", () => {
    const a = hashBytes("med-1|1759665600000");
    expect(a).toHaveLength(16);
    expect([...a]).toEqual([...hashBytes("med-1|1759665600000")]);
  });
  it("differs for different input", () => {
    expect([...hashBytes("a")]).not.toEqual([...hashBytes("b")]);
  });
});

describe("idFromKey", () => {
  const ms = Date.UTC(2026, 9, 5, 12);
  it("is a valid v7 uuid embedding the timestamp", () => {
    const id = idFromKey(ms, "med-1");
    expect(isUuid(id)).toBe(true);
    expect(uuidV7Timestamp(id)).toBe(ms);
  });
  it("is stable for the same timestamp and key", () => {
    expect(idFromKey(ms, "med-1")).toBe(idFromKey(ms, "med-1"));
  });
  it("differs by key at the same timestamp", () => {
    expect(idFromKey(ms, "med-1")).not.toBe(idFromKey(ms, "med-2"));
  });
});
