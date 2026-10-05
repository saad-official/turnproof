import { proofState, type ProofState } from '@turnproof/shared';
import { useCallback, useEffect, useState } from 'react';

import { isSignedIn } from '@/data/auth-client';
import type { ProofLink } from '@/data/mappers';
import { refreshProofs } from '@/data/proofs-client';
import { listProofs } from '@/data/proofs-repo';
import { useLiveQuery } from '@/data/store';
import { useClockTick } from '@/data/time';

export type ProofLinkView = ProofLink & { state: ProofState };

export type ProofsState = {
  /** Newest first, each with `state` (`active | expired | revoked`, shared `proofState`). */
  proofs: ProofLinkView[];
  /** The live link to share, or null. */
  current: ProofLinkView | null;
  /** A `refresh()` call is in flight. */
  refreshing: boolean;
  /** Last `refresh()` failure. */
  error: string | null;
  /** GET /api/proofs?turnoverId= (signed in only); resolves when done, never rejects. */
  refresh: () => Promise<void>;
};

const EMPTY: ProofLinkView[] = [];

/**
 * Proof links of a turnover (cached locally, refreshed from the server on mount when signed in).
 * Publish with `publishProof(turnoverId)`, revoke with `revokeProof(proofId)` from `@/data`.
 */
export function useProofs(turnoverId: string | null | undefined): ProofsState {
  const tick = useClockTick();
  const proofs = useLiveQuery(
    `proofs:${turnoverId ?? ''}`,
    ['proofs'],
    () => {
      if (!turnoverId) return EMPTY;
      const now = new Date(tick).toISOString();
      return listProofs(turnoverId).map((p) => ({ ...p, state: proofState(p, now) }));
    },
    EMPTY,
    String(tick),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!turnoverId || !(await isSignedIn())) return;
    setRefreshing(true);
    try {
      await refreshProofs(turnoverId);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [turnoverId]);

  // Background refresh on mount: failures stay silent (the cached links remain).
  useEffect(() => {
    if (!turnoverId) return;
    isSignedIn()
      .then((signedIn) => (signedIn ? refreshProofs(turnoverId) : null))
      .catch(() => undefined);
  }, [turnoverId]);

  return { proofs, current: proofs.find((p) => p.state === 'active') ?? null, refreshing, error, refresh };
}
