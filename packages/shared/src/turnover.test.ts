import { makePhoto, makeProperty, makeStamp, makeTurnover, uid } from "./fixtures.test-util";
import type { Turnover } from "./schemas";
import { TurnoverSchema } from "./schemas";
import { abandon, addPhoto, completeRoom, elapsedSeconds, finish, goToRoom, removePhoto, start, toggleItem } from "./turnover";

const T0 = "2026-10-06T15:00:00.000Z";
const T1 = "2026-10-06T16:25:30.000Z";
const property = makeProperty();

function started(): Turnover {
  const r = start(makeTurnover(), property, T0);
  if (!r.ok) throw new Error(r.reason);
  return r.turnover;
}

/** Kitchen done (both required items + after photo). */
function kitchenReady(t = started()): Turnover {
  let out = t;
  for (const item of ["counters", "sink"]) out = toggleItem(out, "kitchen", item).turnover;
  return addPhoto(out, makePhoto(uid(10), { roomId: "kitchen", phase: "after" })).turnover;
}

function allReady(): Turnover {
  let t = kitchenReady();
  for (const item of ["toilet", "towels"]) t = toggleItem(t, "bath", item).turnover;
  return addPhoto(t, makePhoto(uid(11), { roomId: "bath", phase: "after" })).turnover;
}

describe("start", () => {
  it("moves a scheduled turnover into progress with a state per room", () => {
    const r = start(makeTurnover(), property, T0);
    expect(r.ok).toBe(true);
    expect(r.turnover.status).toBe("in-progress");
    expect(r.turnover.startedAt).toBe(T0);
    expect(r.turnover.currentRoomIndex).toBe(0);
    expect(r.turnover.roomStates.map((s) => s.roomId)).toEqual(["kitchen", "bath"]);
    expect(r.events).toEqual([{ type: "started", at: T0 }]);
  });
  it("produces a schema-valid turnover", () => {
    expect(TurnoverSchema.safeParse(started()).success).toBe(true);
  });
  it("keeps existing room state", () => {
    const pre = makeTurnover({ roomStates: [{ roomId: "bath", checked: ["toilet"], beforePhotoIds: [], afterPhotoIds: [] }] });
    const r = start(pre, property, T0);
    expect(r.turnover.roomStates[1]?.checked).toEqual(["toilet"]);
  });
  it("refuses a turnover that is not scheduled", () => {
    const r = start(started(), property, T1);
    expect(r).toMatchObject({ ok: false, reason: "not-scheduled", events: [] });
  });
  it("refuses another property's rooms", () => {
    expect(start(makeTurnover(), makeProperty({ id: uid(99) }), T0)).toMatchObject({ ok: false, reason: "wrong-property" });
  });
  it("does not mutate its input", () => {
    const t = makeTurnover();
    start(t, property, T0);
    expect(t.status).toBe("scheduled");
  });
});

describe("toggleItem", () => {
  it("checks then unchecks an item", () => {
    const a = toggleItem(started(), "kitchen", "sink");
    expect(a.turnover.roomStates[0]?.checked).toEqual(["sink"]);
    expect(a.events).toEqual([{ type: "item-toggled", roomId: "kitchen", itemId: "sink", checked: true }]);
    const b = toggleItem(a.turnover, "kitchen", "sink");
    expect(b.turnover.roomStates[0]?.checked).toEqual([]);
    expect(b.events[0]).toMatchObject({ checked: false });
  });
  it("refuses an unknown room", () => {
    expect(toggleItem(started(), "garage", "x")).toMatchObject({ ok: false, reason: "unknown-room" });
  });
  it("refuses before the turnover starts", () => {
    expect(toggleItem(makeTurnover(), "kitchen", "sink")).toMatchObject({ ok: false, reason: "not-in-progress" });
  });
  it("reopens a completed room when an item is unchecked", () => {
    const done = completeRoom(kitchenReady(), property, "kitchen", T0).turnover;
    const r = toggleItem(done, "kitchen", "sink");
    expect(r.turnover.roomStates[0]?.doneAt).toBeUndefined();
    expect(r.events).toContainEqual({ type: "room-reopened", roomId: "kitchen" });
  });
  it("keeps a completed room done when an extra item is checked", () => {
    const done = completeRoom(kitchenReady(), property, "kitchen", T0).turnover;
    expect(toggleItem(done, "kitchen", "oven").turnover.roomStates[0]?.doneAt).toBe(T0);
  });
});

describe("addPhoto", () => {
  it("adds before and after photos to their room", () => {
    let t = addPhoto(started(), makePhoto(uid(1), { phase: "before" })).turnover;
    const r = addPhoto(t, makePhoto(uid(2), { phase: "after" }));
    t = r.turnover;
    expect(t.roomStates[0]?.beforePhotoIds).toEqual([uid(1)]);
    expect(t.roomStates[0]?.afterPhotoIds).toEqual([uid(2)]);
    expect(r.events).toEqual([{ type: "photo-added", roomId: "kitchen", photoId: uid(2), phase: "after" }]);
  });
  it("ignores the same photo twice", () => {
    const once = addPhoto(started(), makePhoto(uid(1))).turnover;
    const twice = addPhoto(once, makePhoto(uid(1)));
    expect(twice.ok).toBe(true);
    expect(twice.events).toEqual([]);
    expect(twice.turnover.roomStates[0]?.afterPhotoIds).toEqual([uid(1)]);
  });
  it("leaves issue and reference photos out of room proof", () => {
    const r = addPhoto(started(), makePhoto(uid(1), { phase: "issue" }));
    expect(r.ok).toBe(true);
    expect(r.events).toEqual([]);
    expect(r.turnover.roomStates[0]?.afterPhotoIds).toEqual([]);
  });
  it("refuses gallery images as proof photos", () => {
    const gallery = makePhoto(uid(1), { stamp: makeStamp({ source: "gallery" }) });
    expect(addPhoto(started(), gallery)).toMatchObject({ ok: false, reason: "gallery-not-proof" });
  });
  it("refuses another turnover's photo", () => {
    expect(addPhoto(started(), makePhoto(uid(1), { turnoverId: uid(77) }))).toMatchObject({ ok: false, reason: "wrong-turnover" });
  });
  it("refuses an unknown room and a turnover that is not running", () => {
    expect(addPhoto(started(), makePhoto(uid(1), { roomId: "garage" }))).toMatchObject({ ok: false, reason: "unknown-room" });
    expect(addPhoto(makeTurnover(), makePhoto(uid(1)))).toMatchObject({ ok: false, reason: "not-in-progress" });
  });
});

describe("removePhoto", () => {
  it("removes a photo from its room", () => {
    const t = addPhoto(started(), makePhoto(uid(1), { phase: "before" })).turnover;
    const r = removePhoto(t, uid(1));
    expect(r.turnover.roomStates[0]?.beforePhotoIds).toEqual([]);
    expect(r.events).toEqual([{ type: "photo-removed", roomId: "kitchen", photoId: uid(1) }]);
  });
  it("reopens a completed room when its last after photo is removed", () => {
    const done = completeRoom(kitchenReady(), property, "kitchen", T0).turnover;
    const r = removePhoto(done, uid(10));
    expect(r.turnover.roomStates[0]?.doneAt).toBeUndefined();
    expect(r.events).toContainEqual({ type: "room-reopened", roomId: "kitchen" });
  });
  it("is a no-op for an unknown photo", () => {
    expect(removePhoto(started(), uid(55))).toMatchObject({ ok: true, events: [] });
  });
});

describe("completeRoom", () => {
  it("refuses an incomplete room", () => {
    const r = completeRoom(started(), property, "kitchen", T1);
    expect(r).toMatchObject({ ok: false, reason: "room-incomplete", events: [] });
  });
  it("refuses a checked room without its after photo", () => {
    let t = started();
    for (const item of ["counters", "sink"]) t = toggleItem(t, "kitchen", item).turnover;
    expect(completeRoom(t, property, "kitchen", T1)).toMatchObject({ ok: false, reason: "room-incomplete" });
  });
  it("stamps doneAt and moves on to the next incomplete room", () => {
    const r = completeRoom(kitchenReady(), property, "kitchen", T1);
    expect(r.ok).toBe(true);
    expect(r.turnover.roomStates[0]?.doneAt).toBe(T1);
    expect(r.turnover.currentRoomIndex).toBe(1);
    expect(r.events).toEqual([
      { type: "room-completed", roomId: "kitchen", at: T1 },
      { type: "room-changed", from: 0, to: 1 },
    ]);
  });
  it("stays put when it was the last incomplete room", () => {
    const t = goToRoom(allReady(), 1).turnover;
    const r = completeRoom(t, property, "bath", T1);
    expect(r.turnover.currentRoomIndex).toBe(1);
    expect(r.events).toEqual([{ type: "room-completed", roomId: "bath", at: T1 }]);
  });
  it("keeps the first doneAt when completed again", () => {
    const once = completeRoom(kitchenReady(), property, "kitchen", T0).turnover;
    const again = completeRoom(once, property, "kitchen", T1);
    expect(again.turnover.roomStates[0]?.doneAt).toBe(T0);
    expect(again.events.some((e) => e.type === "room-completed")).toBe(false);
  });
  it("refuses a room that is not in the property", () => {
    expect(completeRoom(started(), property, "garage", T1)).toMatchObject({ ok: false, reason: "unknown-room" });
  });
  it("refuses when the turnover is not running", () => {
    expect(completeRoom(makeTurnover(), property, "kitchen", T1)).toMatchObject({ ok: false, reason: "not-in-progress" });
  });
});

describe("goToRoom", () => {
  it("changes the current room", () => {
    const r = goToRoom(started(), 1);
    expect(r.turnover.currentRoomIndex).toBe(1);
    expect(r.events).toEqual([{ type: "room-changed", from: 0, to: 1 }]);
  });
  it("is a no-op for the current room", () => {
    expect(goToRoom(started(), 0)).toMatchObject({ ok: true, events: [] });
  });
  it("refuses an index outside the rooms", () => {
    expect(goToRoom(started(), 2)).toMatchObject({ ok: false, reason: "index-out-of-range" });
    expect(goToRoom(started(), -1)).toMatchObject({ ok: false, reason: "index-out-of-range" });
    expect(goToRoom(started(), 0.5)).toMatchObject({ ok: false, reason: "index-out-of-range" });
  });
  it("refuses before the turnover starts", () => {
    expect(goToRoom(makeTurnover(), 0)).toMatchObject({ ok: false, reason: "not-in-progress" });
  });
});

describe("finish", () => {
  it("finishes a complete turnover and computes the duration", () => {
    const r = finish(allReady(), property, T1);
    expect(r.ok).toBe(true);
    expect(r.turnover).toMatchObject({ status: "finished", finishedAt: T1, durationSeconds: 5130, forced: false });
    expect(r.events).toEqual([{ type: "finished", at: T1, durationSeconds: 5130, forced: false }]);
    expect(TurnoverSchema.safeParse(r.turnover).success).toBe(true);
  });
  it("refuses while rooms are incomplete and lists them", () => {
    const r = finish(kitchenReady(), property, T1);
    expect(r).toMatchObject({ ok: false, reason: "rooms-incomplete", incompleteRoomIds: ["bath"] });
  });
  it("needs a note to force-finish", () => {
    expect(finish(started(), property, T1, { force: true })).toMatchObject({ ok: false, reason: "note-required" });
    expect(finish(started(), property, T1, { force: true, note: "   " })).toMatchObject({ ok: false, reason: "note-required" });
  });
  it("force-finishes with a note and marks it forced", () => {
    const r = finish(started(), property, T1, { force: true, note: " Guest still inside bathroom " });
    expect(r.turnover).toMatchObject({ status: "finished", forced: true, note: "Guest still inside bathroom" });
  });
  it("does not mark a complete turnover forced", () => {
    expect(finish(allReady(), property, T1, { force: true }).turnover.forced).toBe(false);
  });
  it("clamps a clock that went backwards to zero seconds", () => {
    expect(finish(allReady(), property, "2026-10-06T14:00:00.000Z").turnover.durationSeconds).toBe(0);
  });
  it("refuses a turnover that is not running", () => {
    expect(finish(makeTurnover(), property, T1)).toMatchObject({ ok: false, reason: "not-in-progress" });
  });
});

describe("abandon", () => {
  it("abandons a running turnover with a note", () => {
    const r = abandon(started(), T1, "Owner cancelled");
    expect(r.turnover).toMatchObject({ status: "abandoned", abandonedAt: T1, note: "Owner cancelled", durationSeconds: 5130 });
    expect(r.events).toEqual([{ type: "abandoned", at: T1 }]);
    expect(TurnoverSchema.safeParse(r.turnover).success).toBe(true);
  });
  it("abandons a scheduled turnover without a duration", () => {
    const r = abandon(makeTurnover(), T1);
    expect(r.turnover.status).toBe("abandoned");
    expect(r.turnover.durationSeconds).toBeUndefined();
  });
  it("refuses a closed turnover", () => {
    const done = finish(allReady(), property, T1).turnover;
    expect(abandon(done, T1)).toMatchObject({ ok: false, reason: "already-closed" });
  });
});

describe("elapsedSeconds", () => {
  it("is zero before starting", () => {
    expect(elapsedSeconds(makeTurnover(), T1)).toBe(0);
  });
  it("counts from startedAt while running", () => {
    expect(elapsedSeconds(started(), "2026-10-06T15:01:05.000Z")).toBe(65);
  });
  it("freezes at the finish or abandon time", () => {
    const done = finish(allReady(), property, T1).turnover;
    expect(elapsedSeconds(done, "2026-10-07T00:00:00.000Z")).toBe(5130);
    const gone = abandon(started(), T1).turnover;
    expect(elapsedSeconds(gone, "2026-10-07T00:00:00.000Z")).toBe(5130);
  });
});
