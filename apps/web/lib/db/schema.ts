/**
 * Postgres schema (docs/spec.md section 3). Every table, including Better
 * Auth's, lives in the `turnproof` Postgres schema so the database can be
 * dedicated or shared with sibling apps.
 *
 * The phone is the source of truth (local SQLite). A signed-in user's
 * properties, turnovers, issues and photo records are mirrored here so the
 * people sharing a property (host and cleaner) see the same schedule and
 * history, and so a turnover can be published as a public proof link:
 * - ids are UUIDs generated on the device and global: one row per id, shared
 *   by every member of the row's property. Writes are only accepted from
 *   members (lib/services/sync.ts), so a client can never overwrite a row of
 *   a property it is not in, whatever ids it sends;
 * - `data` holds the full wire row (@turnproof/shared/schemas) minus device-
 *   only and server-owned fields; the columns next to it are the fields the
 *   server queries (scoping, proof preconditions, the cron sweep);
 * - `updated_at` / `deleted_at` are device times; the later of the two is the
 *   version that decides last-write-wins; `deleted_at` is a synced tombstone;
 * - `server_updated_at` is set on every accepted write (and on uploads) and is
 *   the cursor for `GET /api/sync/pull?since=`.
 *
 * Photos are uploaded only when a proof is published: `photos` carries the
 * upload fields (`remote_url`, `blob_pathname`, `bytes`, the sha256 of the
 * bytes received and whether it equals the stamp's). The bytes live in Vercel
 * Blob, or in `photo_blobs` (bytea) when no Blob token is configured.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const turnproof = pgSchema("turnproof");

const tz = (name: string) => timestamp(name, { withTimezone: true });

// ---------------------------------------------------------------------------
// Enums (value lists exported for zod schemas)
// ---------------------------------------------------------------------------

export const PLATFORMS = ["ios", "android"] as const;
export const MEMBER_ROLES = ["host", "cleaner"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const platformEnum = turnproof.enum("platform", PLATFORMS);
export const memberRoleEnum = turnproof.enum("member_role", MEMBER_ROLES);

/** Postgres `bytea` as a Uint8Array (PGlite returns one; postgres.js a Buffer, which is one). */
const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value.buffer, value.byteOffset, value.byteLength),
  fromDriver: (value) => (value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer)),
});

// ---------------------------------------------------------------------------
// Better Auth core schema (v1.7). JS keys are Better Auth's field names (the
// drizzle adapter looks columns up by them); column names are snake_case.
// ---------------------------------------------------------------------------

export const user = turnproof.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: tz("created_at").notNull().defaultNow(),
  updatedAt: tz("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const session = turnproof.table(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: tz("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at")
      .notNull()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = turnproof.table(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: tz("access_token_expires_at"),
    refreshTokenExpiresAt: tz("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at")
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = turnproof.table(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: tz("expires_at").notNull(),
    createdAt: tz("created_at").notNull().defaultNow(),
    updatedAt: tz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Push devices
// ---------------------------------------------------------------------------

const userRef = (name = "user_id") =>
  text(name)
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

/** One row per Expo push token. Re-registering a token from another account moves it. */
export const devices = turnproof.table(
  "devices",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: userRef(),
    expoPushToken: text("expo_push_token").notNull().unique(),
    platform: platformEnum("platform").notNull(),
    lastSeenAt: tz("last_seen_at").notNull().defaultNow(),
    createdAt: tz("created_at").notNull().defaultNow(),
  },
  (t) => [index("devices_user_id_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Mirrored rows
// ---------------------------------------------------------------------------

/** Sync columns every mirrored table shares. */
const mirrorColumns = () => ({
  id: text("id").primaryKey(),
  /** The full wire row (device-only and server-owned fields removed). */
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  createdAt: tz("created_at").notNull(),
  updatedAt: tz("updated_at").notNull(),
  deletedAt: tz("deleted_at"),
  serverUpdatedAt: tz("server_updated_at").notNull().defaultNow(),
});

/**
 * A property: one owner (who can share it, delete it and remove people) and,
 * once shared, an invite code others join with. Deleting tombstones the row so members' phones
 * drop it on their next pull.
 */
export const properties = turnproof.table(
  "properties",
  {
    ...mirrorColumns(),
    ownerUserId: userRef("owner_user_id"),
    /**
     * 8 characters from an unambiguous alphabet (lib/services/properties.ts).
     * Null until the owner shares the property; rotating replaces it.
     */
    inviteCode: text("invite_code").unique(),
    name: text("name").notNull(),
  },
  (t) => [index("properties_owner_idx").on(t.ownerUserId), index("properties_server_updated_idx").on(t.serverUpdatedAt)],
);

export const propertyMembers = turnproof.table(
  "property_members",
  {
    propertyId: text("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    userId: userRef(),
    role: memberRoleEnum("role").notNull(),
    /** What the property calls this person ("Marta", "Unit owner"). */
    displayName: text("display_name").notNull(),
    joinedAt: tz("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.propertyId, t.userId] }), index("property_members_user_idx").on(t.userId)],
);

const propertyRef = () =>
  text("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "cascade" });

export const turnovers = turnproof.table(
  "turnovers",
  {
    ...mirrorColumns(),
    propertyId: propertyRef(),
    /** The account that first pushed it (the cleaner who did the turnover). */
    userId: userRef(),
    status: text("status").notNull(),
    startedAt: tz("started_at"),
    finishedAt: tz("finished_at"),
  },
  (t) => [index("turnovers_property_server_updated_idx").on(t.propertyId, t.serverUpdatedAt)],
);

const turnoverRef = () =>
  text("turnover_id")
    .notNull()
    .references(() => turnovers.id, { onDelete: "cascade" });

export const issues = turnproof.table(
  "issues",
  {
    ...mirrorColumns(),
    turnoverId: turnoverRef(),
    propertyId: propertyRef(),
    userId: userRef(),
  },
  (t) => [
    index("issues_property_server_updated_idx").on(t.propertyId, t.serverUpdatedAt),
    index("issues_turnover_idx").on(t.turnoverId),
  ],
);

export const photos = turnproof.table(
  "photos",
  {
    ...mirrorColumns(),
    turnoverId: turnoverRef(),
    propertyId: propertyRef(),
    userId: userRef(),
    phase: text("phase").notNull(),
    /** The capture stamp (`takenAt`, `lat`/`lng`, `accuracyM`, `deviceModel`, `sha256`, `source`). */
    stamp: jsonb("stamp").$type<Record<string, unknown>>().notNull(),
    // Server-owned upload fields (never written by a push).
    contentType: text("content_type"),
    remoteUrl: text("remote_url"),
    blobPathname: text("blob_pathname"),
    bytes: integer("bytes"),
    receivedSha256: text("received_sha256"),
    hashMatches: boolean("hash_matches"),
    uploadedAt: tz("uploaded_at"),
  },
  (t) => [
    index("photos_property_server_updated_idx").on(t.propertyId, t.serverUpdatedAt),
    index("photos_turnover_idx").on(t.turnoverId),
    index("photos_uploaded_idx").on(t.uploadedAt).where(sql`${t.uploadedAt} is not null`),
  ],
);

/** Photo bytes when Vercel Blob is not configured (development, tests, tiny deployments). */
export const photoBlobs = turnproof.table("photo_blobs", {
  photoId: text("photo_id")
    .primaryKey()
    .references(() => photos.id, { onDelete: "cascade" }),
  bytes: bytea("bytes").notNull(),
  contentType: text("content_type").notNull(),
  createdAt: tz("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Public proof links
// ---------------------------------------------------------------------------

export const proofs = turnproof.table(
  "proofs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    /** `/p/<slug>`: 10 characters, ~50 random bits (@turnproof/shared/proof). */
    slug: text("slug").notNull().unique(),
    turnoverId: turnoverRef(),
    publishedBy: userRef("published_by"),
    /** IANA zone the page shows times in (the publisher's device zone). */
    timezone: text("timezone").notNull().default("UTC"),
    publishedAt: tz("published_at").notNull().defaultNow(),
    expiresAt: tz("expires_at").notNull(),
    revokedAt: tz("revoked_at"),
  },
  (t) => [index("proofs_turnover_idx").on(t.turnoverId), index("proofs_expires_idx").on(t.expiresAt)],
);
