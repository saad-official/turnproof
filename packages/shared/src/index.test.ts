import * as shared from "./index";

describe("package entry", () => {
  it("re-exports every domain module's public API", () => {
    const names = [
      // ids, tz, csv, sync
      "isUuid", "newIdFrom", "uuidV7Timestamp", "hashBytes", "idFromKey",
      "zonedParts", "zonedMidnight", "zonedInstant", "addDaysToKey", "dayKeyOf", "weekdayOfKey", "localTime", "tzOffsetMinutes",
      "csvEscape", "toCsv",
      "mergeRows", "pickWinner", "rowVersion", "diffDirty", "applyPull", "pullCursor", "planRemoteApply", "acceptPulledPhoto",
      // schemas
      "PropertySchema", "RoomSchema", "ChecklistItemSchema", "TurnoverSchema", "RoomStateSchema", "PhotoSchema", "StampSchema",
      "IssueSchema", "ProofSchema", "SettingsSchema", "DEFAULT_SETTINGS", "PropertyMemberSchema", "DeviceSchema",
      "SyncTablesSchema", "SyncPushRequestSchema", "SyncPushResponseSchema", "SyncPullResponseSchema", "ROOM_KINDS", "InviteCodeSchema",
      // domain
      "ROOM_TEMPLATES", "DEFAULT_SUPPLIES", "newRoomFromTemplate", "defaultPropertyRooms",
      "roomProgress", "turnoverProgress", "nextIncompleteRoomIndex",
      "start", "toggleItem", "addPhoto", "removePhoto", "completeRoom", "goToRoom", "finish", "abandon", "elapsedSeconds",
      "isSha256Hex", "sameSha256", "stampIsVerified", "stampLabel", "STAMP_WINDOW_MINUTES", "STAMP_REASON_TEXT",
      "upcomingTurnovers", "reminderAt", "countdownLabel", "turnoverWindow", "isOverdue", "groupByDay", "formatMinutes",
      "proofModel", "turnoverPdfModel", "toCsvRows", "CSV_HEADER",
      "newProofSlug", "isProofSlug", "proofExpiry", "proofState", "proofUrl", "PROOF_SLUG_ALPHABET", "DEFAULT_PROOF_DAYS",
    ];
    for (const n of names) expect(shared, n).toHaveProperty(n);
  });
});
