// Public surface of the data layer. Screens import intents and reads from '@/data' and reactive
// reads from '@/hooks/use-*'; they never import expo-sqlite, drizzle or the native libraries.
export * from './actions';
export { afterSignIn, deleteAccountEverywhere, signInAndSync, signOutAndForget, signUpAndSync } from './account';
export { ApiError, apiFetch, authedFetch } from './api';
export { API_URL, authClient, isSignedIn, signIn, signOut, signUp, type AuthSession } from './auth-client';
export { registerPushDevice, unregisterPushDevice, type DeviceRegistration } from './devices';
export { getIssue, listIssues } from './issues-repo';
export { getActiveTurnover, localRunIds } from './local-runs';
export type { LocalPhoto, ProofLink } from './mappers';
export { ensureDatabaseReady, useDatabaseMigrations, type DatabaseReadyState } from './migrate';
export { getPhoto, listPhotos, uploadCounts, type UploadCounts } from './photos-repo';
export {
  clearSharedProperties,
  joinProperty,
  type MemberRole,
  type PropertyMemberView,
  refreshSharedProperties,
  removePropertyMember,
  rotateInviteCode,
  shareProperty,
  type SharedPropertyView,
  sharedPropertyView,
} from './properties-client';
export { getProperty, listProperties } from './properties-repo';
export { createProof, refreshProofs, revokeProofLink } from './proofs-client';
export { currentProof, listProofs } from './proofs-repo';
export type { UploadState } from './schema';
export { seedDemoData } from './seed';
export { getAppValue, getSettings, setAppValue } from './settings-repo';
export { createStore, onTablesChanged, useStore, type Store, type TableName } from './store';
export { pendingPushCount, pullSince, pushDirty, scheduleSync, syncNow, syncStatus, type SyncStatus } from './sync-client';
export { getDeviceId, getSyncState, resetSyncCursors, type SyncedTable, type SyncState } from './sync-state-repo';
export { dayBounds, deviceTimeZone, formatClock, nowIso, todayKey, useClockTick, useSecondTick, useToday } from './time';
export { getTurnover, listAllTurnovers, listTurnoversBetween, listTurnoversForProperty } from './turnovers-repo';
export {
  kickUploadQueue,
  retryFailedUploads,
  type TurnoverUploadResult,
  type UploadPauseReason,
  type UploadQueueState,
  uploadQueueStore,
  uploadTurnoverPhotos,
} from './upload-queue';
export { activeTurnoverView, toTurnoverView, turnoverView, turnoverViewsBetween, type TurnoverView, upcomingTurnoverViews } from './views';
