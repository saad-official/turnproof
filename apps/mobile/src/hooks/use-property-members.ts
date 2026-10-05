import { useEffect } from 'react';

import {
  type MemberRole,
  type PropertyMemberView,
  refreshSharedProperties,
  sharedPropertiesStore,
} from '@/data/properties-client';
import { useStore } from '@/data/store';

const EMPTY: PropertyMemberView[] = [];

export type PropertyMembersState = {
  /** Host and cleaners (cached offline); empty when the property is not shared. */
  members: PropertyMemberView[];
  /** The signed-in user's role on this property, or null when it is not shared. */
  role: MemberRole | null;
  /** Hosts only: the code a cleaner joins with. */
  inviteCode: string | null;
  loading: boolean;
  error: string | null;
  /** GET /api/properties; resolves when done, never rejects (failures land in `error`). */
  refresh: () => Promise<void>;
};

const refresh = () =>
  refreshSharedProperties()
    .then(() => undefined)
    .catch(() => undefined);

/**
 * Who shares a property (`GET /api/properties`, cached in settings). Share with `shareProperty`,
 * join with `joinProperty(code)`, leave with `leaveProperty(propertyId)` (all from `@/data`).
 */
export function usePropertyMembers(propertyId: string | null | undefined, opts: { refreshOnMount?: boolean } = {}): PropertyMembersState {
  const view = useStore(sharedPropertiesStore, (s) => (propertyId ? (s.byProperty[propertyId] ?? null) : null));
  const loading = useStore(sharedPropertiesStore, (s) => s.loading);
  const error = useStore(sharedPropertiesStore, (s) => s.error);
  const refreshOnMount = opts.refreshOnMount ?? true;
  useEffect(() => {
    if (refreshOnMount) void refresh();
  }, [refreshOnMount]);
  return {
    members: view?.members ?? EMPTY,
    role: view?.role ?? null,
    inviteCode: view?.inviteCode ?? null,
    loading,
    error,
    refresh,
  };
}
