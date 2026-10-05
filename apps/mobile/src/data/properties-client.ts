// Shared properties (`/api/properties*`): a host shares a property's invite code, a cleaner joins
// with it, both then see its schedule through sync. The server's membership view is cached in
// settings (`app.propertyMembers`) so `usePropertyMembers` works offline.
import type { Property } from '@turnproof/shared';

import { ApiError, apiFetch } from './api';
import { isSignedIn } from './auth-client';
import { getProperty, saveProperty } from './properties-repo';
import { getAppValue, setAppValue } from './settings-repo';
import { createStore } from './store';
import { syncNow } from './sync-client';
import { nowIso } from './time';

export type MemberRole = 'host' | 'cleaner';

export type PropertyMemberView = {
  userId: string;
  /** Better Auth `user.name`. */
  name: string;
  role: MemberRole;
  joinedAt: string;
  /** The signed-in user. */
  isMe: boolean;
};

/** One shared property as the server reports it (`GET /api/properties`). */
export type SharedPropertyView = {
  propertyId: string;
  name: string;
  /** The caller's role on this property. */
  role: MemberRole;
  /** Hosts only. */
  inviteCode: string | null;
  members: PropertyMemberView[];
};

export type SharedPropertiesState = {
  /** Keyed by property id. */
  byProperty: Record<string, SharedPropertyView>;
  loading: boolean;
  error: string | null;
  updatedAt: string | null;
};

const CACHE_KEY = 'propertyMembers';

function stateFrom(list: SharedPropertyView[], extra: Partial<SharedPropertiesState> = {}): SharedPropertiesState {
  return {
    byProperty: Object.fromEntries(list.map((p) => [p.propertyId, p])),
    loading: false,
    error: null,
    updatedAt: null,
    ...extra,
  };
}

export const sharedPropertiesStore = createStore<SharedPropertiesState>(stateFrom([]));
let hydrated = false;

/** Loads the persisted cache once (after migrations). */
export function hydrateSharedProperties(): void {
  if (hydrated) return;
  hydrated = true;
  const cached = getAppValue<{ list: SharedPropertyView[]; updatedAt: string } | null>(CACHE_KEY, null);
  if (cached) sharedPropertiesStore.setState(stateFrom(cached.list, { updatedAt: cached.updatedAt }));
}

function save(list: SharedPropertyView[]): SharedPropertyView[] {
  const updatedAt = nowIso();
  setAppValue(CACHE_KEY, { list, updatedAt });
  sharedPropertiesStore.setState(stateFrom(list, { updatedAt }));
  return list;
}

/** Writes a server-issued invite code onto the local property row (it syncs like any edit). */
function rememberInviteCode(propertyId: string, code: string | null): void {
  const p = getProperty(propertyId);
  if (!p || (p.inviteCode ?? null) === code) return;
  saveProperty({ ...p, inviteCode: code, updatedAt: nowIso() });
}

/** GET /api/properties → refreshes the membership cache. Signed out → empty. */
export async function refreshSharedProperties(): Promise<SharedPropertyView[]> {
  hydrateSharedProperties();
  if (!(await isSignedIn())) return save([]);
  sharedPropertiesStore.setState((s) => ({ ...s, loading: true, error: null }));
  try {
    const { properties } = await apiFetch<{ properties: SharedPropertyView[] }>('/api/properties');
    for (const p of properties) if (p.role === 'host' && p.inviteCode) rememberInviteCode(p.propertyId, p.inviteCode);
    return save(properties);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return save([]);
    sharedPropertiesStore.setState((s) => ({ ...s, loading: false, error: error instanceof Error ? error.message : String(error) }));
    throw error;
  }
}

/**
 * Host: share a local property. Pushes it first (the server must know the row), then
 * POST /api/properties/:id/share → invite code (stored on the property). Idempotent.
 */
export async function shareProperty(propertyId: string): Promise<SharedPropertyView> {
  await syncNow();
  const { property } = await apiFetch<{ property: SharedPropertyView }>(
    `/api/properties/${encodeURIComponent(propertyId)}/share`,
    { method: 'POST' },
  );
  if (property.inviteCode) rememberInviteCode(propertyId, property.inviteCode);
  await refreshSharedProperties().catch(() => undefined);
  return property;
}

/**
 * Cleaner: join with an invite code (POST /api/properties/join), then pull so the property and its
 * schedule land locally. Errors: 404 `invite_not_found`, 409 `already_member`.
 */
export async function joinProperty(code: string): Promise<{ propertyId: string; property: Property | null }> {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const { property } = await apiFetch<{ property: SharedPropertyView }>('/api/properties/join', {
    method: 'POST',
    body: { code: normalized },
  });
  await syncNow();
  await refreshSharedProperties().catch(() => undefined);
  return { propertyId: property.propertyId, property: getProperty(property.propertyId) };
}

/** Host: issue a new invite code (the old one stops working). */
export async function rotateInviteCode(propertyId: string): Promise<string> {
  const { inviteCode } = await apiFetch<{ inviteCode: string }>(
    `/api/properties/${encodeURIComponent(propertyId)}/invite`,
    { method: 'POST' },
  );
  rememberInviteCode(propertyId, inviteCode);
  await refreshSharedProperties().catch(() => undefined);
  return inviteCode;
}

/** Host removes a member, or a member leaves (`userId` = 'me'). */
export async function removePropertyMember(propertyId: string, userId: string): Promise<void> {
  await apiFetch(`/api/properties/${encodeURIComponent(propertyId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });
  await refreshSharedProperties().catch(() => undefined);
}

/** The cached view of one property (null when not shared or unknown). */
export function sharedPropertyView(propertyId: string): SharedPropertyView | null {
  hydrateSharedProperties();
  return sharedPropertiesStore.getSnapshot().byProperty[propertyId] ?? null;
}

/** Forget cached memberships (sign-out). */
export function clearSharedProperties(): void {
  save([]);
}
