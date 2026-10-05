import type { LocalPhoto } from '@/data/mappers';
import { listPhotos } from '@/data/photos-repo';
import { useLiveQuery } from '@/data/store';

const EMPTY: LocalPhoto[] = [];

/**
 * Live photos of a turnover by capture time (`roomId` omitted = all; `null` = photos without a room;
 * a string = that room). Each has `stamp` (render with shared `stampLabel` / `stampIsVerified`),
 * `localUri` (show with expo-image), `remoteUrl` and `uploadState`.
 */
export function usePhotos(turnoverId: string | null | undefined, roomId?: string | null): LocalPhoto[] {
  return useLiveQuery(
    `photos:${turnoverId ?? ''}:${roomId === undefined ? '*' : (roomId ?? 'none')}`,
    ['photos'],
    () => (turnoverId ? listPhotos(turnoverId, roomId) : EMPTY),
    EMPTY,
  );
}
