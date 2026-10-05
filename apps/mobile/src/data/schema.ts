// Device SQLite schema. Timestamps are ISO-8601 UTC strings (`Date#toISOString()`), so lexical
// comparison in SQL equals chronological order. JSON columns (`*_json`) are validated with the
// shared zod schemas on read and write (see mappers.ts).
// Regenerate migrations after editing: `pnpm --filter mobile db:generate`.
import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const syncColumns = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  deletedAt: text('deleted_at'),
};

export const properties = sqliteTable('properties', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address'),
  lat: real('lat'),
  lng: real('lng'),
  /** Local wall-clock `HH:mm`. */
  checkoutTime: text('checkout_time').notNull(),
  checkinTime: text('checkin_time').notNull(),
  accessNotes: text('access_notes'),
  /** `Room[]` JSON (rooms with their checklist items), validated with `RoomSchema`. */
  roomsJson: text('rooms_json').notNull(),
  /** `string[]` JSON: supplies to restock. */
  suppliesJson: text('supplies_json').notNull(),
  inviteCode: text('invite_code'),
  ...syncColumns,
});

export const turnovers = sqliteTable(
  'turnovers',
  {
    id: text('id').primaryKey(),
    propertyId: text('property_id').notNull(),
    scheduledFor: text('scheduled_for').notNull(),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    abandonedAt: text('abandoned_at'),
    status: text('status', { enum: ['scheduled', 'in-progress', 'finished', 'abandoned'] }).notNull(),
    currentRoomIndex: integer('current_room_index').notNull().default(0),
    /** `RoomState[]` JSON, validated with `RoomStateSchema`. */
    roomStatesJson: text('room_states_json').notNull(),
    durationSeconds: integer('duration_seconds'),
    note: text('note'),
    forced: integer('forced', { mode: 'boolean' }),
    proofId: text('proof_id'),
    ...syncColumns,
  },
  (t) => [
    index('turnovers_scheduled_idx').on(t.scheduledFor),
    index('turnovers_property_idx').on(t.propertyId, t.scheduledFor),
    index('turnovers_status_idx').on(t.status),
  ],
);

export const UPLOAD_STATES = ['local', 'uploading', 'uploaded', 'failed'] as const;
export type UploadState = (typeof UPLOAD_STATES)[number];

export const photos = sqliteTable(
  'photos',
  {
    id: text('id').primaryKey(),
    turnoverId: text('turnover_id').notNull(),
    roomId: text('room_id'),
    phase: text('phase', { enum: ['before', 'after', 'issue', 'reference'] }).notNull(),
    /** `file://…/turnproof/photos/<id>.jpg` in the document directory (null once the file is gone). */
    localUri: text('local_uri'),
    remoteUrl: text('remote_url'),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** `Stamp` JSON (takenAt, lat/lng, accuracyM, deviceModel, sha256, source). */
    stampJson: text('stamp_json').notNull(),
    /** Device-only upload bookkeeping (never synced). */
    uploadState: text('upload_state', { enum: UPLOAD_STATES }).notNull().default('local'),
    uploadAttempts: integer('upload_attempts').notNull().default(0),
    uploadError: text('upload_error'),
    /** Earliest retry instant after a failure (exponential backoff). */
    nextAttemptAt: text('next_attempt_at'),
    ...syncColumns,
  },
  (t) => [
    index('photos_turnover_idx').on(t.turnoverId, t.roomId),
    index('photos_upload_idx').on(t.uploadState),
    index('photos_updated_idx').on(t.updatedAt),
  ],
);

export const issues = sqliteTable(
  'issues',
  {
    id: text('id').primaryKey(),
    turnoverId: text('turnover_id').notNull(),
    roomId: text('room_id'),
    photoId: text('photo_id'),
    severity: text('severity', { enum: ['low', 'medium', 'high'] }).notNull(),
    note: text('note').notNull().default(''),
    ...syncColumns,
  },
  (t) => [index('issues_turnover_idx').on(t.turnoverId)],
);

/** Published proof links (server-owned; cached here for the UI and offline display). */
export const proofs = sqliteTable(
  'proofs',
  {
    id: text('id').primaryKey(),
    turnoverId: text('turnover_id').notNull(),
    slug: text('slug').notNull(),
    url: text('url').notNull(),
    publishedAt: text('published_at').notNull(),
    expiresAt: text('expires_at').notNull(),
    revokedAt: text('revoked_at'),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('proofs_turnover_idx').on(t.turnoverId)],
);

/** Key/value settings. Values are JSON; keys of shared `Settings` plus `app.*` device-local keys. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Sync bookkeeping, one row per synced table (`properties`, `turnovers`, `photos`, `issues`):
 * `pushed_up_to` = highest row version the server accepted, `pulled_at` = server cursor of the last pull.
 */
export const syncState = sqliteTable('sync_state', {
  tableName: text('table_name').primaryKey(),
  pushedUpTo: text('pushed_up_to'),
  pulledAt: text('pulled_at'),
  updatedAt: text('updated_at').notNull(),
});

export type PropertyRow = typeof properties.$inferSelect;
export type TurnoverRow = typeof turnovers.$inferSelect;
export type PhotoRow = typeof photos.$inferSelect;
export type IssueRow = typeof issues.$inferSelect;
export type ProofRow = typeof proofs.$inferSelect;
export type SettingRow = typeof settings.$inferSelect;
export type SyncStateRow = typeof syncState.$inferSelect;
