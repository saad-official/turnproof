import { toCsv } from "./csv";
import { makeIssue, makePhoto, makeProperty, makeStamp, makeTurnover, PROPERTY_ID, TURNOVER_ID, uid } from "./fixtures.test-util";
import { CSV_HEADER, proofModel, toCsvRows, turnoverPdfModel } from "./report";
import type { Turnover } from "./schemas";

const TZ = "America/Toronto";
const property = makeProperty({ address: "12 Maple St", accessNotes: "Lockbox 4821", inviteCode: "HQ7K2M" });

const finished: Turnover = makeTurnover({
  status: "finished",
  startedAt: "2026-10-06T15:00:00.000Z",
  finishedAt: "2026-10-06T16:25:00.000Z",
  durationSeconds: 5100,
  roomStates: [
    { roomId: "kitchen", checked: ["counters", "sink"], beforePhotoIds: [uid(1)], afterPhotoIds: [uid(3), uid(2)], doneAt: "2026-10-06T15:40:00.000Z" },
    { roomId: "bath", checked: ["toilet"], beforePhotoIds: [], afterPhotoIds: [] },
  ],
});

const photos = [
  makePhoto(uid(1), { phase: "before", stamp: makeStamp({ takenAt: "2026-10-06T15:01:00.000Z" }), remoteUrl: "https://blob.example/1.jpg" }),
  makePhoto(uid(2), { phase: "after", stamp: makeStamp({ takenAt: "2026-10-06T15:30:00.000Z" }), localUri: "file:///2.jpg" }),
  makePhoto(uid(3), { phase: "after", stamp: makeStamp({ takenAt: "2026-10-06T15:35:00.000Z" }) }),
  makePhoto(uid(4), { phase: "reference", stamp: makeStamp({ source: "gallery", takenAt: "2026-09-01T10:00:00.000Z" }) }),
  makePhoto(uid(5), { phase: "issue", roomId: "bath", stamp: makeStamp({ takenAt: "2026-10-06T16:00:00.000Z" }) }),
  makePhoto(uid(6), { phase: "after", deletedAt: "2026-10-06T16:00:00.000Z" }),
  makePhoto(uid(7), { phase: "after", turnoverId: uid(99) }),
];

const issues = [
  makeIssue(uid(20), { roomId: "bath", photoId: uid(5), severity: "low", note: "Chipped tile", createdAt: "2026-10-06T16:00:00.000Z" }),
  makeIssue(uid(21), { roomId: "bath", severity: "high", note: "Broken towel rail", createdAt: "2026-10-06T16:05:00.000Z" }),
  makeIssue(uid(22), { severity: "medium", note: "Smoke smell" }),
  makeIssue(uid(23), { roomId: "bath", note: "Deleted", deletedAt: "2026-10-06T16:10:00.000Z" }),
];

describe("proofModel", () => {
  const model = proofModel(property, finished, photos, issues, TZ);

  it("exposes property name but no access notes, invite code or address by default", () => {
    expect(model.property).toEqual({ name: "Maple St", address: null });
    expect(JSON.stringify(model)).not.toContain("Lockbox");
    expect(JSON.stringify(model)).not.toContain("HQ7K2M");
  });
  it("includes the address on request", () => {
    expect(proofModel(property, finished, photos, issues, TZ, { includeAddress: true }).property.address).toBe("12 Maple St");
  });
  it("summarises the turnover with its duration", () => {
    expect(model.turnover).toMatchObject({ status: "finished", durationSeconds: 5100, durationLabel: "1 h 25 min", forced: false });
  });
  it("lists rooms in property order with checklist detail", () => {
    expect(model.rooms.map((r) => r.name)).toEqual(["Kitchen", "Bathroom"]);
    const kitchen = model.rooms[0]!;
    expect(kitchen.complete).toBe(true);
    expect(kitchen.doneAt).toBe("2026-10-06T15:40:00.000Z");
    expect(kitchen.checklist.items).toEqual([
      { id: "counters", label: "Counters", required: true, checked: true },
      { id: "sink", label: "Sink", required: true, checked: true },
      { id: "oven", label: "Oven", required: false, checked: false },
    ]);
    expect(kitchen.checklist).toMatchObject({ checkedRequired: 2, totalRequired: 2, checkedAll: 2, totalAll: 3 });
  });
  it("orders before and after photos by capture time with stamp labels and badges", () => {
    const kitchen = model.rooms[0]!;
    expect(kitchen.before.map((p) => p.id)).toEqual([uid(1)]);
    expect(kitchen.after.map((p) => p.id)).toEqual([uid(2), uid(3)]);
    expect(kitchen.before[0]).toMatchObject({ url: "https://blob.example/1.jpg", verified: true, stampLabel: "Tue 6 Oct, 11:01 · 43.65, −79.38 (±8 m)" });
    expect(kitchen.after[0]?.url).toBe("file:///2.jpg");
    expect(kitchen.after[1]?.url).toBeNull();
  });
  it("shows gallery references separately and unverified", () => {
    const refs = model.rooms[0]!.references;
    expect(refs.map((p) => p.id)).toEqual([uid(4)]);
    expect(refs[0]).toMatchObject({ verified: false, source: "gallery" });
    expect(refs[0]?.reasons).toContain("not-camera");
  });
  it("skips deleted photos and other turnovers' photos", () => {
    const ids = JSON.stringify(model);
    expect(ids).not.toContain(uid(6));
    expect(ids).not.toContain(uid(7));
  });
  it("attaches room issues, most severe first, with their photo", () => {
    const bath = model.rooms[1]!;
    expect(bath.issues.map((i) => i.severity)).toEqual(["high", "low"]);
    expect(bath.issues[1]?.photo?.id).toBe(uid(5));
    expect(bath.issues[0]?.photo).toBeNull();
  });
  it("puts issues without a room in generalIssues and drops deleted ones", () => {
    expect(model.generalIssues.map((i) => i.note)).toEqual(["Smoke smell"]);
    expect(JSON.stringify(model)).not.toContain("Deleted");
  });
  it("adds up totals", () => {
    expect(model.totals).toEqual({
      roomsDone: 1,
      roomsTotal: 2,
      itemsDone: 3,
      itemsTotal: 5,
      photos: 3,
      verifiedPhotos: 3,
      referencePhotos: 1,
      issues: 3,
      issuesBySeverity: { low: 1, medium: 1, high: 1 },
    });
    expect(model.allVerified).toBe(true);
  });
  it("is not all-verified when a proof photo fails verification", () => {
    const late = photos.map((p) => (p.id === uid(3) ? { ...p, stamp: makeStamp({ takenAt: "2026-10-07T10:00:00.000Z" }) } : p));
    const m = proofModel(property, finished, late, issues, TZ);
    expect(m.totals.verifiedPhotos).toBe(2);
    expect(m.allVerified).toBe(false);
  });
  it("has a null duration label for an unfinished turnover", () => {
    const m = proofModel(property, makeTurnover(), [], [], TZ);
    expect(m.turnover.durationLabel).toBeNull();
    expect(m.allVerified).toBe(false);
  });
});

describe("turnoverPdfModel", () => {
  it("adds a title, a dated subtitle and summary lines", () => {
    const pdf = turnoverPdfModel(property, finished, photos, issues, TZ);
    expect(pdf.title).toBe("Turnover · Maple St");
    expect(pdf.subtitle).toBe("Tue, 6 Oct 2026");
    expect(pdf.summary).toEqual(["Duration 1 h 25 min", "1/2 rooms complete", "3/5 checklist items", "3 photos (3 verified)", "3 issues (1 high)"]);
  });
  it("includes the address (the PDF stays with the user)", () => {
    expect(turnoverPdfModel(property, finished, photos, issues, TZ).property.address).toBe("12 Maple St");
  });
  it("flags a forced finish", () => {
    const pdf = turnoverPdfModel(property, { ...finished, forced: true, note: "Guest late" }, photos, [], TZ);
    expect(pdf.summary).toContain("Finished with incomplete rooms: Guest late");
  });
});

describe("toCsvRows", () => {
  const other = makeTurnover({ id: uid(30), scheduledFor: "2026-10-05T15:00:00.000Z", status: "abandoned", abandonedAt: "2026-10-05T14:00:00.000Z", note: "=cancelled" });
  const gone = makeTurnover({ id: uid(31), deletedAt: "2026-10-06T00:00:00.000Z" });
  const orphan = makeTurnover({ id: uid(32), propertyId: uid(33), scheduledFor: "2026-10-07T15:00:00.000Z" });

  it("starts with the header and skips deleted turnovers", () => {
    const rows = toCsvRows([finished, other, gone, orphan], [property], TZ, issues);
    expect(rows[0]).toEqual(CSV_HEADER);
    expect(rows).toHaveLength(4);
  });
  it("writes one row per turnover in local time, by schedule", () => {
    const rows = toCsvRows([finished, other], [property], TZ, issues);
    expect(rows[1]?.[0]).toBe("2026-10-05");
    expect(rows[2]).toEqual([
      "2026-10-06",
      "Maple St",
      "11:00",
      "finished",
      "2026-10-06 11:00",
      "2026-10-06 12:25",
      85,
      1,
      2,
      3,
      5,
      3,
      3,
      "",
      "",
    ]);
  });
  it("names a missing property and leaves its counts blank", () => {
    const rows = toCsvRows([orphan], [property], TZ);
    expect(rows[1]?.slice(1, 2)).toEqual(["(deleted property)"]);
    expect(rows[1]?.[8]).toBe("");
  });
  it("marks forced finishes and is safe for spreadsheets", () => {
    const rows = toCsvRows([{ ...finished, forced: true }, other], [property], TZ);
    expect(rows[2]?.[13]).toBe("yes");
    expect(toCsv(rows)).toContain("'=cancelled");
  });
  it("matches the header width", () => {
    for (const row of toCsvRows([finished, other, orphan], [property], TZ)) expect(row).toHaveLength(CSV_HEADER.length);
  });
});

void PROPERTY_ID;
void TURNOVER_ID;
