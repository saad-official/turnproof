// Public proof links (`/api/proofs*`). The server owns proofs (slug, expiry, revocation); the
// device caches them in the `proofs` table for the UI. Publishing itself (upload photos, push the
// turnover, then create the link) is `publishProof` in actions.ts.
import { DEFAULT_PROOF_DAYS, type Proof, proofUrl } from '@turnproof/shared';

import { apiFetch } from './api';
import { API_URL } from './auth-client';
import type { ProofLink } from './mappers';
import { putProofs } from './proofs-repo';

/** Server proof plus its public URL (`url` may be omitted by the server; derived from the slug). */
type WireProof = Proof & { url?: string };

const toLink = (p: WireProof): ProofLink => ({
  id: p.id,
  turnoverId: p.turnoverId,
  slug: p.slug,
  url: p.url ?? proofUrl(p.slug, API_URL),
  publishedAt: p.publishedAt,
  expiresAt: p.expiresAt,
  revokedAt: p.revokedAt ?? null,
});

/**
 * POST /api/proofs `{ turnoverId, expiresInDays }` → a new public link (the turnover, its photos and
 * issues must already be on the server). Errors: 404 `turnover_not_found`, 409 `turnover_not_finished`,
 * 409 `photos_missing` (some proof photos have no uploaded copy yet).
 */
export async function createProof(turnoverId: string, expiresInDays = DEFAULT_PROOF_DAYS): Promise<ProofLink> {
  const { proof } = await apiFetch<{ proof: WireProof }>('/api/proofs', { method: 'POST', body: { turnoverId, expiresInDays } });
  const link = toLink(proof);
  putProofs([link]);
  return link;
}

/** DELETE /api/proofs/:id → the page stops resolving at once. */
export async function revokeProofLink(proofId: string): Promise<ProofLink> {
  const { proof } = await apiFetch<{ proof: WireProof }>(`/api/proofs/${encodeURIComponent(proofId)}`, { method: 'DELETE' });
  const link = toLink(proof);
  putProofs([link]);
  return link;
}

/** GET /api/proofs?turnoverId= → refreshes the cache for one turnover (or all of the user's proofs). */
export async function refreshProofs(turnoverId?: string): Promise<ProofLink[]> {
  const { proofs } = await apiFetch<{ proofs: WireProof[] }>('/api/proofs', { query: { turnoverId } });
  const links = proofs.map(toLink);
  putProofs(links);
  return links;
}
