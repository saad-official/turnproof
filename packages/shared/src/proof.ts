import type { Proof } from "./schemas";
import type { IsoString } from "./tz";

/** 32 URL-safe lower-case characters: digits 2–9 and a–z without l and o (no 0/1/l/o look-alikes). */
export const PROOF_SLUG_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";
export const PROOF_SLUG_LENGTH = 10;
export const DEFAULT_PROOF_DAYS = 60;
export const PROOF_BASE_URL = "https://getturnproof.vercel.app";

const SLUG_RE = /^[2-9a-km-np-z]{10}$/;

/**
 * A public proof slug from at least 10 caller-supplied random bytes (expo-crypto / Web Crypto):
 * each byte's low 5 bits pick a character, which is uniform because 256 is a multiple of 32. 50 bits.
 */
export function newProofSlug(randomBytes: Uint8Array): string {
  if (randomBytes.length < PROOF_SLUG_LENGTH) throw new RangeError("newProofSlug needs at least 10 random bytes");
  let out = "";
  for (let i = 0; i < PROOF_SLUG_LENGTH; i++) out += PROOF_SLUG_ALPHABET[randomBytes[i]! & 31];
  return out;
}

export function isProofSlug(value: unknown): value is string {
  return typeof value === "string" && SLUG_RE.test(value);
}

/** Expiry instant: `days` × 24 h after publishing (default 60). */
export function proofExpiry(publishedAt: IsoString, days = DEFAULT_PROOF_DAYS): IsoString {
  if (!(days > 0)) throw new RangeError("days must be positive");
  return new Date(Date.parse(publishedAt) + days * 86_400_000).toISOString();
}

export type ProofState = "active" | "expired" | "revoked";

/** Revoked wins over expired; expired from the `expiresAt` instant on. */
export function proofState(proof: Pick<Proof, "expiresAt" | "revokedAt">, now: IsoString): ProofState {
  if (proof.revokedAt) return "revoked";
  return Date.parse(now) >= Date.parse(proof.expiresAt) ? "expired" : "active";
}

/** A turnover's proof status for lists: `none` when it never had a link. */
export type ProofSummaryState = ProofState | "none";

/**
 * One state for a turnover's links (any order): `active` while any link is still live, otherwise
 * the newest link's state (`expired` / `revoked`), `none` without links.
 */
export function latestProofState(
  proofs: readonly Pick<Proof, "publishedAt" | "expiresAt" | "revokedAt">[],
  now: IsoString,
): ProofSummaryState {
  if (proofs.length === 0) return "none";
  if (proofs.some((p) => proofState(p, now) === "active")) return "active";
  const newest = proofs.reduce((a, b) => (Date.parse(b.publishedAt) > Date.parse(a.publishedAt) ? b : a));
  return proofState(newest, now);
}

/** Public page URL for a slug. */
export function proofUrl(slug: string, origin = PROOF_BASE_URL): string {
  return `${origin.replace(/\/+$/, "")}/p/${slug}`;
}
