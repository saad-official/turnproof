import { uid } from "./fixtures.test-util";
import {
  DEFAULT_PROOF_DAYS,
  isProofSlug,
  latestProofState,
  newProofSlug,
  PROOF_SLUG_ALPHABET,
  proofExpiry,
  proofState,
  proofUrl,
} from "./proof";
import { ProofSchema } from "./schemas";

describe("PROOF_SLUG_ALPHABET", () => {
  it("has 32 unique characters without 0, 1, l or o", () => {
    expect(PROOF_SLUG_ALPHABET).toHaveLength(32);
    expect(new Set(PROOF_SLUG_ALPHABET).size).toBe(32);
    for (const c of ["0", "1", "l", "o"]) expect(PROOF_SLUG_ALPHABET).not.toContain(c);
  });
});

describe("newProofSlug", () => {
  it("maps 10 random bytes to 10 alphabet characters", () => {
    const slug = newProofSlug(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 31]));
    expect(slug).toBe("23456789az");
  });
  it("uses the low five bits so every byte value is uniform", () => {
    expect(newProofSlug(new Uint8Array(10).fill(32))).toBe(newProofSlug(new Uint8Array(10).fill(0)));
    expect(newProofSlug(new Uint8Array(10).fill(255))).toBe("z".repeat(10));
  });
  it("ignores bytes beyond the tenth", () => {
    expect(newProofSlug(new Uint8Array(16))).toHaveLength(10);
  });
  it("needs at least 10 bytes", () => {
    expect(() => newProofSlug(new Uint8Array(9))).toThrow(RangeError);
  });
  it("always produces a slug the schema accepts", () => {
    for (let b = 0; b < 256; b += 7) {
      const slug = newProofSlug(new Uint8Array(10).map((_, i) => (b + i * 37) % 256));
      expect(isProofSlug(slug), slug).toBe(true);
    }
  });
});

describe("isProofSlug", () => {
  it("rejects wrong lengths, upper case and ambiguous characters", () => {
    expect(isProofSlug("abcdefghij")).toBe(true);
    expect(isProofSlug("abcdefghi")).toBe(false);
    expect(isProofSlug("ABCDEFGHIJ")).toBe(false);
    expect(isProofSlug("abcdefgh0j")).toBe(false);
    expect(isProofSlug(12)).toBe(false);
  });
});

describe("proofExpiry", () => {
  it("defaults to 60 days after publishing", () => {
    expect(DEFAULT_PROOF_DAYS).toBe(60);
    expect(proofExpiry("2026-10-06T12:00:00.000Z")).toBe("2026-12-05T12:00:00.000Z");
  });
  it("accepts a custom number of days", () => {
    expect(proofExpiry("2026-10-06T12:00:00.000Z", 14)).toBe("2026-10-20T12:00:00.000Z");
  });
  it("rejects non-positive day counts", () => {
    expect(() => proofExpiry("2026-10-06T12:00:00.000Z", 0)).toThrow(RangeError);
  });
});

describe("proofState", () => {
  const proof = ProofSchema.parse({
    id: uid(1),
    turnoverId: uid(2),
    slug: "abcdefghij",
    publishedAt: "2026-10-06T12:00:00.000Z",
    expiresAt: "2026-12-05T12:00:00.000Z",
  });
  it("is active before expiry", () => {
    expect(proofState(proof, "2026-12-05T11:59:59.000Z")).toBe("active");
  });
  it("is expired from the expiry instant", () => {
    expect(proofState(proof, "2026-12-05T12:00:00.000Z")).toBe("expired");
  });
  it("is revoked once revoked, even before expiry", () => {
    expect(proofState({ ...proof, revokedAt: "2026-10-07T00:00:00.000Z" }, "2026-10-08T00:00:00.000Z")).toBe("revoked");
    expect(proofState({ ...proof, revokedAt: "2026-10-07T00:00:00.000Z" }, "2027-01-01T00:00:00.000Z")).toBe("revoked");
  });
});

describe("latestProofState", () => {
  const NOW = "2026-10-10T00:00:00.000Z";
  const link = (publishedAt: string, expiresAt: string, revokedAt: string | null = null) => ({ publishedAt, expiresAt, revokedAt });
  it("is none without links", () => {
    expect(latestProofState([], NOW)).toBe("none");
  });
  it("is the newest link's state", () => {
    const revokedNewest = link("2026-10-09T00:00:00.000Z", "2026-12-08T00:00:00.000Z", "2026-10-09T01:00:00.000Z");
    const expiredOlder = link("2026-08-01T00:00:00.000Z", "2026-08-08T00:00:00.000Z");
    expect(latestProofState([expiredOlder, revokedNewest], NOW)).toBe("revoked");
    expect(latestProofState([expiredOlder], NOW)).toBe("expired");
  });
  it("is active while any link is still live, even when a newer one was revoked", () => {
    const live = link("2026-10-01T00:00:00.000Z", "2026-11-30T00:00:00.000Z");
    const revokedNewer = link("2026-10-09T00:00:00.000Z", "2026-12-08T00:00:00.000Z", "2026-10-09T01:00:00.000Z");
    expect(latestProofState([revokedNewer, live], NOW)).toBe("active");
  });
});

describe("proofUrl", () => {
  it("builds the public link", () => {
    expect(proofUrl("abcdefghij")).toBe("https://getturnproof.vercel.app/p/abcdefghij");
    expect(proofUrl("abcdefghij", "http://localhost:3900/")).toBe("http://localhost:3900/p/abcdefghij");
  });
});
