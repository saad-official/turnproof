import type { Property } from '@turnproof/shared';

import { getProperty, listProperties } from '@/data/properties-repo';
import { useLiveQuery } from '@/data/store';

const EMPTY: Property[] = [];

/** Live (not deleted) properties by name, with rooms, checklist items and supplies. */
export function useProperties(): Property[] {
  return useLiveQuery('properties', ['properties'], listProperties, EMPTY);
}

/** One property (deleted ones included, check `deletedAt`), or null. */
export function useProperty(id: string | null | undefined): Property | null {
  return useLiveQuery(`property:${id ?? ''}`, ['properties'], () => (id ? getProperty(id) : null), null);
}
