import { z } from "zod";
import { isUuid } from "./ids";

/** ISO-8601 timestamp, `Z` or numeric offset. */
export const IsoTimestamp = z.iso.datetime({ offset: true });
/** Row ids: UUIDs generated on device (UUIDv7). */
export const IdSchema = z.string().refine(isUuid, "Invalid UUID");
/** Ids of rooms and checklist items, which live as JSON inside a property row. */
export const LocalIdSchema = z.string().trim().min(1).max(64);
export const DayKeySchema = z.iso.date();
/** 24-hour local wall-clock time, zero-padded `HH:mm`. */
export const HhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm");
/** Invite codes: 6–8 chars, uppercase, no look-alikes (0 O 1 I L). */
export const InviteCodeSchema = z.string().regex(/^[A-HJKMNP-Z2-9]{6,8}$/, "Invalid invite code");
/** SHA-256 digest as 64 hex characters; stored lower-case. */
export const Sha256Schema = z
  .string()
  .trim()
  .regex(/^[0-9a-fA-F]{64}$/, "Invalid SHA-256 hex digest")
  .toLowerCase();
/** Public proof slug: 10 chars from `PROOF_SLUG_ALPHABET` (no 0, 1, l, o). */
export const ProofSlugSchema = z.string().regex(/^[2-9a-km-np-z]{10}$/, "Invalid proof slug");

export const ROOM_KINDS = ["bedroom", "bathroom", "kitchen", "living", "entry", "outdoor", "laundry", "other"] as const;
export const TURNOVER_STATUSES = ["scheduled", "in-progress", "finished", "abandoned"] as const;
export const PHOTO_PHASES = ["before", "after", "issue", "reference"] as const;
export const PHOTO_SOURCES = ["camera", "gallery"] as const;
export const ISSUE_SEVERITIES = ["low", "medium", "high"] as const;
export const USER_ROLES = ["cleaner", "host", "both"] as const;

export const RoomKindSchema = z.enum(ROOM_KINDS);
export const TurnoverStatusSchema = z.enum(TURNOVER_STATUSES);
export const PhotoPhaseSchema = z.enum(PHOTO_PHASES);
export const PhotoSourceSchema = z.enum(PHOTO_SOURCES);
export const IssueSeveritySchema = z.enum(ISSUE_SEVERITIES);
export const UserRoleSchema = z.enum(USER_ROLES);

const unique = <T>(xs: readonly T[]) => new Set(xs).size === xs.length;
const before = (a: string | null | undefined, b: string | null | undefined) => !a || !b || Date.parse(a) <= Date.parse(b);

const syncFields = {
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
  deletedAt: IsoTimestamp.nullish(),
};

const Latitude = z.number().min(-90).max(90);
const Longitude = z.number().min(-180).max(180);

export const ChecklistItemSchema = z.object({
  id: LocalIdSchema,
  label: z.string().trim().min(1).max(120),
  required: z.boolean().default(true),
});

export const RoomSchema = z.object({
  id: LocalIdSchema,
  name: z.string().trim().min(1).max(60),
  kind: RoomKindSchema,
  items: z
    .array(ChecklistItemSchema)
    .max(60)
    .default([])
    .refine((items) => unique(items.map((i) => i.id)), "Duplicate checklist item id"),
  /** When true (default) the room is only complete with at least one "after" photo. */
  requiresAfterPhoto: z.boolean().default(true),
});

export const PropertySchema = z
  .object({
    id: IdSchema,
    name: z.string().trim().min(1).max(80),
    address: z.string().trim().max(200).nullish(),
    lat: Latitude.nullish(),
    lng: Longitude.nullish(),
    checkoutTime: HhmmSchema,
    checkinTime: HhmmSchema,
    accessNotes: z.string().trim().max(2000).nullish(),
    /** Ordered walk-through; stored as JSON on the property row. */
    rooms: z
      .array(RoomSchema)
      .max(40)
      .default([])
      .refine((rooms) => unique(rooms.map((r) => r.id)), "Duplicate room id"),
    supplies: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
    inviteCode: InviteCodeSchema.nullish(),
    ...syncFields,
  })
  .refine((p) => (p.lat == null) === (p.lng == null), { message: "lat and lng go together", path: ["lng"] });

export const RoomStateSchema = z.object({
  roomId: LocalIdSchema,
  /** Checked checklist item ids. */
  checked: z.array(LocalIdSchema).default([]),
  beforePhotoIds: z.array(IdSchema).default([]),
  afterPhotoIds: z.array(IdSchema).default([]),
  /** Set by `completeRoom`; cleared when a checked item is unchecked. */
  doneAt: IsoTimestamp.nullish(),
});

export const TurnoverSchema = z
  .object({
    id: IdSchema,
    propertyId: IdSchema,
    /** The checkout instant this turnover follows (see `turnoverWindow`). */
    scheduledFor: IsoTimestamp,
    startedAt: IsoTimestamp.nullish(),
    finishedAt: IsoTimestamp.nullish(),
    abandonedAt: IsoTimestamp.nullish(),
    status: TurnoverStatusSchema,
    currentRoomIndex: z.number().int().min(0).default(0),
    roomStates: z.array(RoomStateSchema).default([]),
    durationSeconds: z.number().int().min(0).nullish(),
    note: z.string().trim().max(2000).nullish(),
    /** True when finished with `force` while some rooms were incomplete. */
    forced: z.boolean().nullish(),
    proofId: IdSchema.nullish(),
    ...syncFields,
  })
  .refine((t) => t.status === "scheduled" || t.status === "abandoned" || !!t.startedAt, {
    message: "startedAt is required once started",
    path: ["startedAt"],
  })
  .refine((t) => t.status !== "finished" || !!t.finishedAt, { message: "finishedAt is required when finished", path: ["finishedAt"] })
  .refine((t) => t.status !== "abandoned" || !!t.abandonedAt, {
    message: "abandonedAt is required when abandoned",
    path: ["abandonedAt"],
  })
  .refine((t) => before(t.startedAt, t.finishedAt), { message: "finishedAt must not be before startedAt", path: ["finishedAt"] });

export const StampSchema = z.object({
  takenAt: IsoTimestamp,
  lat: Latitude.nullish(),
  lng: Longitude.nullish(),
  accuracyM: z.number().min(0).nullish(),
  deviceModel: z.string().trim().min(1).max(120),
  sha256: Sha256Schema,
  source: PhotoSourceSchema,
});

export const PhotoSchema = z
  .object({
    id: IdSchema,
    turnoverId: IdSchema,
    roomId: LocalIdSchema.nullish(),
    phase: PhotoPhaseSchema,
    localUri: z.string().min(1).nullish(),
    remoteUrl: z.url().nullish(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    stamp: StampSchema,
    ...syncFields,
  })
  .refine((p) => p.stamp.source === "camera" || p.phase === "reference", {
    message: "Gallery imports can only be reference photos",
    path: ["phase"],
  })
  .refine((p) => (p.phase !== "before" && p.phase !== "after") || !!p.roomId, {
    message: "Before and after photos belong to a room",
    path: ["roomId"],
  });

export const IssueSchema = z
  .object({
    id: IdSchema,
    turnoverId: IdSchema,
    roomId: LocalIdSchema.nullish(),
    photoId: IdSchema.nullish(),
    severity: IssueSeveritySchema,
    note: z.string().trim().max(1000).default(""),
    ...syncFields,
  })
  .refine((i) => i.note.length > 0 || !!i.photoId, { message: "An issue needs a note or a photo", path: ["note"] });

/** Server-owned: a published, expiring, revocable public proof link. */
export const ProofSchema = z
  .object({
    id: IdSchema,
    turnoverId: IdSchema,
    slug: ProofSlugSchema,
    publishedAt: IsoTimestamp,
    expiresAt: IsoTimestamp,
    revokedAt: IsoTimestamp.nullish(),
  })
  .refine((p) => Date.parse(p.expiresAt) > Date.parse(p.publishedAt), {
    message: "expiresAt must be after publishedAt",
    path: ["expiresAt"],
  });

export const SettingsSchema = z.object({
  onboarded: z.boolean().default(false),
  role: UserRoleSchema.default("cleaner"),
  /** Minutes before the property's checkout time to remind. */
  reminderLeadMinutes: z.number().int().min(0).max(24 * 60).default(60),
  /** Record GPS in photo stamps (when the OS permits). */
  stampGps: z.boolean().default(true),
  displayName: z.string().trim().min(1).max(60).optional(),
});

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

export const PropertyMemberSchema = z.object({
  id: IdSchema,
  propertyId: IdSchema,
  userId: z.string().min(1),
  role: z.enum(["host", "cleaner"]),
  joinedAt: IsoTimestamp,
  ...syncFields,
});

export const DeviceSchema = z.object({
  userId: z.string().min(1),
  expoPushToken: z.string().min(1),
  platform: z.enum(["ios", "android"]),
  lastSeenAt: IsoTimestamp,
});

export const SyncTablesSchema = z.object({
  properties: z.array(PropertySchema).default([]),
  turnovers: z.array(TurnoverSchema).default([]),
  photos: z.array(PhotoSchema).default([]),
  issues: z.array(IssueSchema).default([]),
});

const EMPTY_TABLES = { properties: [], turnovers: [], photos: [], issues: [] };

/** Device → server: rows dirtied since the last push (soft deletes carry `deletedAt`). */
export const SyncPushRequestSchema = z.object({
  deviceId: z.string().min(1),
  tables: SyncTablesSchema.default(EMPTY_TABLES),
});

export const SyncPushResponseSchema = z.object({
  serverTime: IsoTimestamp,
  accepted: z.number().int().nonnegative(),
});

/** Server → device: rows changed since `?since=`; `serverTime` becomes the next `since`. */
export const SyncPullResponseSchema = z.object({
  serverTime: IsoTimestamp,
  tables: SyncTablesSchema.default(EMPTY_TABLES),
});

export type RoomKind = z.infer<typeof RoomKindSchema>;
export type TurnoverStatus = z.infer<typeof TurnoverStatusSchema>;
export type PhotoPhase = z.infer<typeof PhotoPhaseSchema>;
export type PhotoSource = z.infer<typeof PhotoSourceSchema>;
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type Property = z.infer<typeof PropertySchema>;
export type RoomState = z.infer<typeof RoomStateSchema>;
export type Turnover = z.infer<typeof TurnoverSchema>;
export type Stamp = z.infer<typeof StampSchema>;
export type Photo = z.infer<typeof PhotoSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type Proof = z.infer<typeof ProofSchema>;
export type Settings = z.infer<typeof SettingsSchema>;
export type PropertyMember = z.infer<typeof PropertyMemberSchema>;
export type Device = z.infer<typeof DeviceSchema>;
export type SyncTables = z.infer<typeof SyncTablesSchema>;
export type SyncPushRequest = z.infer<typeof SyncPushRequestSchema>;
export type SyncPushResponse = z.infer<typeof SyncPushResponseSchema>;
export type SyncPullResponse = z.infer<typeof SyncPullResponseSchema>;
