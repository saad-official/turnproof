import {
  ChecklistItemSchema,
  DEFAULT_SETTINGS,
  DeviceSchema,
  HhmmSchema,
  InviteCodeSchema,
  IssueSchema,
  PhotoSchema,
  PropertyMemberSchema,
  PropertySchema,
  ProofSchema,
  ROOM_KINDS,
  RoomSchema,
  RoomStateSchema,
  SettingsSchema,
  StampSchema,
  SyncPullResponseSchema,
  SyncPushRequestSchema,
  TurnoverSchema,
} from "./schemas";
import { CREATED, makeIssue, makePhoto, makeProperty, makeRoom, makeStamp, makeTurnover, uid } from "./fixtures.test-util";

describe("primitives", () => {
  it("accepts zero-padded 24h HH:mm only", () => {
    expect(HhmmSchema.safeParse("09:30").success).toBe(true);
    expect(HhmmSchema.safeParse("23:59").success).toBe(true);
    expect(HhmmSchema.safeParse("9:30").success).toBe(false);
    expect(HhmmSchema.safeParse("24:00").success).toBe(false);
  });
  it("accepts invite codes without look-alike characters", () => {
    expect(InviteCodeSchema.safeParse("HQ7K2M").success).toBe(true);
    expect(InviteCodeSchema.safeParse("MAP0E7").success).toBe(false);
    expect(InviteCodeSchema.safeParse("abc234").success).toBe(false);
  });
  it("lists the room kinds", () => {
    expect(ROOM_KINDS).toEqual(["bedroom", "bathroom", "kitchen", "living", "entry", "outdoor", "laundry", "other"]);
  });
});

describe("RoomSchema", () => {
  it("defaults requiresAfterPhoto to true and items to required", () => {
    const room = RoomSchema.parse({ id: "r1", name: "Kitchen", kind: "kitchen", items: [{ id: "i1", label: "Sink" }] });
    expect(room.requiresAfterPhoto).toBe(true);
    expect(room.items[0]?.required).toBe(true);
  });
  it("rejects duplicate item ids", () => {
    const items = [
      { id: "a", label: "A", required: true },
      { id: "a", label: "B", required: true },
    ];
    expect(RoomSchema.safeParse(makeRoom({ items })).success).toBe(false);
  });
  it("rejects an unknown kind and a blank label", () => {
    expect(RoomSchema.safeParse(makeRoom({ kind: "garage" as never })).success).toBe(false);
    expect(ChecklistItemSchema.safeParse({ id: "x", label: "  " }).success).toBe(false);
  });
});

describe("PropertySchema", () => {
  it("parses a valid property", () => {
    expect(PropertySchema.parse(makeProperty()).name).toBe("Maple St");
  });
  it("requires lat and lng together and in range", () => {
    expect(PropertySchema.safeParse(makeProperty({ lat: 43.6 })).success).toBe(false);
    expect(PropertySchema.safeParse(makeProperty({ lat: 43.6, lng: -79.3 })).success).toBe(true);
    expect(PropertySchema.safeParse(makeProperty({ lat: 91, lng: 0 })).success).toBe(false);
  });
  it("rejects duplicate room ids", () => {
    expect(PropertySchema.safeParse(makeProperty({ rooms: [makeRoom(), makeRoom()] })).success).toBe(false);
  });
  it("defaults supplies to an empty list", () => {
    const { supplies: _ignored, ...rest } = makeProperty();
    expect(PropertySchema.parse(rest).supplies).toEqual([]);
  });
  it("rejects malformed checkout times", () => {
    expect(PropertySchema.safeParse(makeProperty({ checkoutTime: "11am" })).success).toBe(false);
  });
});

describe("TurnoverSchema", () => {
  it("parses a scheduled turnover", () => {
    expect(TurnoverSchema.parse(makeTurnover()).status).toBe("scheduled");
  });
  it("requires startedAt once in progress", () => {
    expect(TurnoverSchema.safeParse(makeTurnover({ status: "in-progress" })).success).toBe(false);
    expect(TurnoverSchema.safeParse(makeTurnover({ status: "in-progress", startedAt: CREATED })).success).toBe(true);
  });
  it("requires finishedAt not before startedAt when finished", () => {
    const start = "2026-10-06T15:00:00.000Z";
    expect(TurnoverSchema.safeParse(makeTurnover({ status: "finished", startedAt: start })).success).toBe(false);
    expect(
      TurnoverSchema.safeParse(makeTurnover({ status: "finished", startedAt: start, finishedAt: "2026-10-06T14:00:00.000Z" })).success,
    ).toBe(false);
    expect(
      TurnoverSchema.safeParse(makeTurnover({ status: "finished", startedAt: start, finishedAt: "2026-10-06T16:00:00.000Z" })).success,
    ).toBe(true);
  });
  it("requires abandonedAt when abandoned", () => {
    expect(TurnoverSchema.safeParse(makeTurnover({ status: "abandoned" })).success).toBe(false);
    expect(TurnoverSchema.safeParse(makeTurnover({ status: "abandoned", abandonedAt: CREATED })).success).toBe(true);
  });
  it("rejects a negative room index", () => {
    expect(TurnoverSchema.safeParse(makeTurnover({ currentRoomIndex: -1 })).success).toBe(false);
  });
  it("defaults room state arrays", () => {
    expect(RoomStateSchema.parse({ roomId: "kitchen" })).toEqual({ roomId: "kitchen", checked: [], beforePhotoIds: [], afterPhotoIds: [] });
  });
});

describe("StampSchema", () => {
  it("accepts a camera stamp and lower-cases the hash", () => {
    expect(StampSchema.parse(makeStamp({ sha256: "AB".repeat(32) })).sha256).toBe("ab".repeat(32));
  });
  it("rejects a malformed hash", () => {
    expect(StampSchema.safeParse(makeStamp({ sha256: "abc" })).success).toBe(false);
    expect(StampSchema.safeParse(makeStamp({ sha256: "g".repeat(64) })).success).toBe(false);
  });
  it("allows a stamp without GPS but not a negative accuracy", () => {
    const { lat: _a, lng: _b, accuracyM: _c, ...noGps } = makeStamp();
    expect(StampSchema.safeParse(noGps).success).toBe(true);
    expect(StampSchema.safeParse(makeStamp({ accuracyM: -1 })).success).toBe(false);
  });
});

describe("PhotoSchema", () => {
  it("parses a camera after photo", () => {
    expect(PhotoSchema.parse(makePhoto(uid(1))).phase).toBe("after");
  });
  it("only lets gallery imports be reference photos", () => {
    const gallery = makeStamp({ source: "gallery" });
    expect(PhotoSchema.safeParse(makePhoto(uid(1), { stamp: gallery })).success).toBe(false);
    expect(PhotoSchema.safeParse(makePhoto(uid(1), { stamp: gallery, phase: "reference" })).success).toBe(true);
  });
  it("requires a room for before and after photos", () => {
    expect(PhotoSchema.safeParse(makePhoto(uid(1), { roomId: undefined })).success).toBe(false);
    expect(PhotoSchema.safeParse(makePhoto(uid(1), { roomId: undefined, phase: "issue" })).success).toBe(true);
  });
  it("requires positive integer dimensions", () => {
    expect(PhotoSchema.safeParse(makePhoto(uid(1), { width: 0 })).success).toBe(false);
  });
});

describe("IssueSchema", () => {
  it("parses an issue with a note", () => {
    expect(IssueSchema.parse(makeIssue(uid(2))).severity).toBe("medium");
  });
  it("needs a note or a photo", () => {
    expect(IssueSchema.safeParse(makeIssue(uid(2), { note: "" })).success).toBe(false);
    expect(IssueSchema.safeParse(makeIssue(uid(2), { note: "", photoId: uid(1) })).success).toBe(true);
  });
  it("rejects an unknown severity", () => {
    expect(IssueSchema.safeParse(makeIssue(uid(2), { severity: "critical" as never })).success).toBe(false);
  });
});

describe("ProofSchema", () => {
  const proof = {
    id: uid(3),
    turnoverId: uid(4),
    slug: "abcd23efgh",
    publishedAt: "2026-10-06T00:00:00.000Z",
    expiresAt: "2026-12-05T00:00:00.000Z",
  };
  it("parses a proof", () => {
    expect(ProofSchema.parse(proof).slug).toBe("abcd23efgh");
  });
  it("rejects short slugs and slugs with ambiguous characters", () => {
    expect(ProofSchema.safeParse({ ...proof, slug: "abc" }).success).toBe(false);
    expect(ProofSchema.safeParse({ ...proof, slug: "abcd1lefgh" }).success).toBe(false);
  });
  it("rejects an expiry before publishing", () => {
    expect(ProofSchema.safeParse({ ...proof, expiresAt: "2026-10-05T00:00:00.000Z" }).success).toBe(false);
  });
});

describe("SettingsSchema", () => {
  it("has the documented defaults", () => {
    expect(DEFAULT_SETTINGS).toEqual({ onboarded: false, role: "cleaner", reminderLeadMinutes: 60, stampGps: true });
  });
  it("bounds the reminder lead time", () => {
    expect(SettingsSchema.safeParse({ reminderLeadMinutes: -5 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ reminderLeadMinutes: 24 * 60 + 1 }).success).toBe(false);
  });
  it("trims the display name", () => {
    expect(SettingsSchema.parse({ role: "host", displayName: " Ana " }).displayName).toBe("Ana");
  });
});

describe("members, devices and sync payloads", () => {
  it("parses a property member and rejects unknown roles", () => {
    const m = { id: uid(5), propertyId: uid(6), userId: "user_1", role: "cleaner", joinedAt: CREATED, createdAt: CREATED, updatedAt: CREATED };
    expect(PropertyMemberSchema.parse(m).role).toBe("cleaner");
    expect(PropertyMemberSchema.safeParse({ ...m, role: "admin" }).success).toBe(false);
  });
  it("parses a device", () => {
    const d = { userId: "u", expoPushToken: "ExponentPushToken[x]", platform: "ios", lastSeenAt: CREATED };
    expect(DeviceSchema.safeParse(d).success).toBe(true);
  });
  it("defaults every sync table to empty", () => {
    expect(SyncPushRequestSchema.parse({ deviceId: "d1" }).tables).toEqual({ properties: [], turnovers: [], photos: [], issues: [] });
    const pull = SyncPullResponseSchema.parse({ serverTime: CREATED, tables: { turnovers: [makeTurnover()] } });
    expect(pull.tables.turnovers).toHaveLength(1);
    expect(pull.tables.photos).toEqual([]);
  });
  it("rejects invalid rows inside a push", () => {
    expect(SyncPushRequestSchema.safeParse({ deviceId: "d1", tables: { photos: [makePhoto("not-a-uuid")] } }).success).toBe(false);
  });
});
