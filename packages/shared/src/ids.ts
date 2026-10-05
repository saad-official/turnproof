/** IDs are UUIDv7 strings generated on device; this module validates and formats them. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_TIMESTAMP = 2 ** 48 - 1;

/** True for an RFC 9562 UUID (versions 1–8, variant 10xx), any case. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

function hex(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

/**
 * Format a UUIDv7 from a millisecond timestamp and at least 10 random bytes
 * (the caller supplies them, e.g. from expo-crypto), so output is deterministic.
 */
export function newIdFrom(timestampMs: number, randomBytes: Uint8Array): string {
  if (!Number.isInteger(timestampMs) || timestampMs < 0 || timestampMs > MAX_TIMESTAMP) {
    throw new RangeError("timestampMs must be an integer between 0 and 2^48 - 1");
  }
  if (randomBytes.length < 10) throw new RangeError("newIdFrom needs at least 10 random bytes");
  const r = (i: number) => randomBytes[i] ?? 0;
  const bytes: number[] = [];
  for (let shift = 40; shift >= 0; shift -= 8) bytes.push(Math.floor(timestampMs / 2 ** shift) % 256);
  bytes.push(0x70 | (r(0) & 0x0f), r(1), 0x80 | (r(2) & 0x3f));
  for (let i = 3; i < 10; i++) bytes.push(r(i));
  const h = bytes.map(hex).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The embedded millisecond timestamp of a UUIDv7, or null for any other id. */
export function uuidV7Timestamp(id: string): number | null {
  if (!isUuid(id) || id[14] !== "7") return null;
  return parseInt(id.slice(0, 8) + id.slice(9, 13), 16);
}

/** 16 deterministic, well-mixed bytes from a string (cyrb128). Not cryptographic. */
export function hashBytes(input: string): Uint8Array {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  const out = new Uint8Array(16);
  [h1, h2, h3, h4].forEach((h, i) => {
    for (let b = 0; b < 4; b++) out[i * 4 + b] = (h >>> (24 - b * 8)) & 0xff;
  });
  return out;
}

/** A deterministic UUIDv7: `timestampMs` in the time field, hash of `key` + timestamp in the rest. */
export function idFromKey(timestampMs: number, key: string): string {
  return newIdFrom(timestampMs, hashBytes(`${key}|${timestampMs}`));
}
