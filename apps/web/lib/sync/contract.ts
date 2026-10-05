import { z } from "zod";
import {
  IsoTimestamp,
  IssueSchema,
  PhotoSchema,
  PropertySchema,
  TurnoverSchema,
  type Issue,
  type Photo,
  type Property,
  type Turnover,
} from "@turnproof/shared/schemas";
import { MEMBER_ROLES } from "@/lib/db/schema";

/**
 * Wire contract for `POST /api/sync/push` and `GET /api/sync/pull` (the Expo
 * app's `src/data` sync client). Row shapes are the domain package's
 * (`@turnproof/shared/schemas`): Property, Turnover, Issue, Photo.
 *
 * Push body: `{ deviceId?, role?, tables: { properties?, turnovers?, issues?, photos? } }`.
 * Tables are applied in that order, so one push can carry a new property and
 * everything under it. A push may only write rows of properties the caller is
 * a member of; a property id the server has never seen is created with the
 * caller as owner (role `role`, default `host`) and a fresh invite code.
 * Issues and photos inherit their property from their turnover, which must
 * already exist (earlier in the same push is fine). Merge is last-write-wins
 * on the row version (later of `updatedAt` / `deletedAt`), ties to the
 * incoming row; versions more than a day ahead of the server clock are
 * refused. Device-only (`localUri`) and server-owned (`remoteUrl`,
 * `inviteCode`) fields in a push are ignored.
 * Answer: `{ serverTime, accepted, rejected: [{ table, id, reason }] }`.
 *
 * Pull (`?since=<serverTime>`): every row of the caller's properties written
 * on the server after `since` (all when omitted), tombstones included, as
 * `{ serverTime, tables }`. Properties carry `inviteCode` for their owner
 * (null for everyone else); turnovers, issues and photos carry `userId` (the
 * account that created them); photos carry the upload fields `remoteUrl`
 * (absolute URL of `/api/photos/<id>/file`), `bytes`, `hashMatches` and
 * `uploadedAt`. `serverTime` is the next `since`; it lags the clock by a few
 * seconds so a push committing during a pull is re-sent rather than missed.
 */

export const SYNC_TABLES = ["properties", "turnovers", "issues", "photos"] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** Max rows per table in one push. */
export const MAX_PUSH_ROWS = 1000;
/** How far the pull cursor (`serverTime`) lags the server clock. */
export const PULL_OVERLAP_MS = 5_000;
/** Row versions further than this ahead of the server clock are refused. */
export const MAX_CLOCK_SKEW_MS = 86_400_000;

export { IsoTimestamp };

const rows = <T extends z.ZodType>(schema: T) =>
  z.array(schema).max(MAX_PUSH_ROWS, `At most ${MAX_PUSH_ROWS} rows per table per push.`).default([]);

export const SyncPushRequestSchema = z.object({
  deviceId: z.string().max(128).optional(),
  /** The caller's role on properties this push creates (default `host`). */
  role: z.enum(MEMBER_ROLES).optional(),
  tables: z
    .object({
      properties: rows(PropertySchema),
      turnovers: rows(TurnoverSchema),
      issues: rows(IssueSchema),
      photos: rows(PhotoSchema),
    })
    .default({ properties: [], turnovers: [], issues: [], photos: [] }),
});
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;

export type RejectReason = "not_member" | "property_deleted" | "unknown_turnover" | "clock_skew";
export type SyncRejection = { table: SyncTable; id: string; reason: RejectReason };
export type SyncPushResponse = { serverTime: string; accepted: number; rejected: SyncRejection[] };

export type PulledProperty = Property & { inviteCode: string | null };
export type PulledTurnover = Turnover & { userId: string };
export type PulledIssue = Issue & { userId: string };
export type PulledPhoto = Omit<Photo, "localUri"> & {
  userId: string;
  remoteUrl: string | null;
  bytes: number | null;
  hashMatches: boolean | null;
  uploadedAt: string | null;
};
export type SyncTables = {
  properties: PulledProperty[];
  turnovers: PulledTurnover[];
  issues: PulledIssue[];
  photos: PulledPhoto[];
};
export type SyncPullResponse = { serverTime: string; tables: SyncTables };
