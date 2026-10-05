// Cached proof links (the server owns them; see proofs-client.ts).
import { desc, eq, inArray } from 'drizzle-orm';

import { db } from './db';
import { type ProofLink, toProofLink } from './mappers';
import { proofs } from './schema';
import { notifyTables } from './store';
import { nowIso } from './time';

/** Proof links of a turnover, newest first (revoked and expired ones included). */
export function listProofs(turnoverId: string): ProofLink[] {
  return db.select().from(proofs).where(eq(proofs.turnoverId, turnoverId)).orderBy(desc(proofs.publishedAt)).all().map(toProofLink);
}

/** Cached proof links of several turnovers, grouped by turnover id, each list newest first. */
export function listProofsByTurnover(turnoverIds: readonly string[]): Map<string, ProofLink[]> {
  const out = new Map<string, ProofLink[]>();
  if (!turnoverIds.length) return out;
  const rows = db.select().from(proofs).where(inArray(proofs.turnoverId, [...turnoverIds])).orderBy(desc(proofs.publishedAt)).all();
  for (const row of rows) {
    const link = toProofLink(row);
    out.set(link.turnoverId, [...(out.get(link.turnoverId) ?? []), link]);
  }
  return out;
}

export function getProof(id: string): ProofLink | null {
  const row = db.select().from(proofs).where(eq(proofs.id, id)).get();
  return row ? toProofLink(row) : null;
}

/** The link to share: newest, not revoked, not expired. */
export function currentProof(turnoverId: string, now: string = nowIso()): ProofLink | null {
  return listProofs(turnoverId).find((p) => !p.revokedAt && p.expiresAt > now) ?? null;
}

export function putProofs(list: readonly ProofLink[]): void {
  if (!list.length) return;
  const at = nowIso();
  db.transaction((tx) => {
    for (const p of list) {
      const row = { ...p, updatedAt: at };
      tx.insert(proofs).values(row).onConflictDoUpdate({ target: proofs.id, set: row }).run();
    }
  });
  notifyTables('proofs');
}
