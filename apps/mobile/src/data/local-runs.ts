// Turnovers started on this device. The Live Activity / Live Update and `useActiveTurnover` follow
// these, not a co-worker's run that arrived through sync.
import type { Turnover } from '@turnproof/shared';

import { getAppValue, setAppValue } from './settings-repo';
import { listTurnoversByStatus } from './turnovers-repo';

const LOCAL_RUNS_KEY = 'localRuns';

export function localRunIds(): string[] {
  return getAppValue<string[]>(LOCAL_RUNS_KEY, []);
}

export function markLocalRun(id: string, running: boolean): void {
  const ids = new Set(localRunIds());
  if (running === ids.has(id)) return;
  if (running) ids.add(id);
  else ids.delete(id);
  setAppValue(LOCAL_RUNS_KEY, ids.size ? [...ids] : undefined);
}

/** The turnover running on this device (most recently started), or null. */
export function getActiveTurnover(): Turnover | null {
  const mine = new Set(localRunIds());
  if (!mine.size) return null;
  const running = listTurnoversByStatus(['in-progress']).filter((t) => mine.has(t.id));
  return running.sort((a, b) => Date.parse(b.startedAt ?? '') - Date.parse(a.startedAt ?? ''))[0] ?? null;
}
