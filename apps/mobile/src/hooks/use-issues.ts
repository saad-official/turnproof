import type { Issue } from '@turnproof/shared';

import { listIssues } from '@/data/issues-repo';
import { useLiveQuery } from '@/data/store';

const EMPTY: Issue[] = [];

/** Live issues of a turnover (optionally one room), oldest first. */
export function useIssues(turnoverId: string | null | undefined, roomId?: string): Issue[] {
  return useLiveQuery(
    `issues:${turnoverId ?? ''}:${roomId ?? '*'}`,
    ['issues'],
    () => (turnoverId ? listIssues(turnoverId, roomId) : EMPTY),
    EMPTY,
  );
}
