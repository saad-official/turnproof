import { nextIncompleteRoomIndex, roomProgress, turnoverProgress } from "./checklist";
import { makeProperty, makeRoom, makeTurnover, uid } from "./fixtures.test-util";
import type { RoomState } from "./schemas";

const state = (overrides: Partial<RoomState> = {}): RoomState => ({ roomId: "kitchen", checked: [], beforePhotoIds: [], afterPhotoIds: [], ...overrides });

describe("roomProgress", () => {
  it("counts nothing for a room without state", () => {
    expect(roomProgress(makeRoom(), undefined)).toEqual({
      checkedRequired: 0,
      totalRequired: 2,
      checkedAll: 0,
      totalAll: 3,
      beforePhotos: 0,
      afterPhotos: 0,
      needsAfterPhoto: true,
      complete: false,
    });
  });
  it("counts checked required and optional items separately", () => {
    const p = roomProgress(makeRoom(), state({ checked: ["counters", "oven"] }));
    expect(p.checkedRequired).toBe(1);
    expect(p.checkedAll).toBe(2);
  });
  it("ignores checked ids that are no longer in the room", () => {
    const p = roomProgress(makeRoom(), state({ checked: ["counters", "deleted-item"] }));
    expect(p.checkedAll).toBe(1);
  });
  it("is incomplete without an after photo when the room requires one", () => {
    const p = roomProgress(makeRoom(), state({ checked: ["counters", "sink"] }));
    expect(p.complete).toBe(false);
    expect(p.needsAfterPhoto).toBe(true);
  });
  it("is complete with all required items and an after photo, optional items aside", () => {
    const p = roomProgress(makeRoom(), state({ checked: ["counters", "sink"], afterPhotoIds: [uid(1)] }));
    expect(p.complete).toBe(true);
    expect(p.needsAfterPhoto).toBe(false);
  });
  it("does not count before photos towards the after-photo rule", () => {
    expect(roomProgress(makeRoom(), state({ checked: ["counters", "sink"], beforePhotoIds: [uid(1)] })).complete).toBe(false);
  });
  it("needs no photo when the room does not require one", () => {
    const room = makeRoom({ requiresAfterPhoto: false });
    const p = roomProgress(room, state({ checked: ["counters", "sink"] }));
    expect(p.complete).toBe(true);
    expect(p.needsAfterPhoto).toBe(false);
  });
  it("treats a room with no required items as complete once photographed", () => {
    const room = makeRoom({ items: [{ id: "x", label: "Optional", required: false }] });
    expect(roomProgress(room, state()).complete).toBe(false);
    expect(roomProgress(room, state({ afterPhotoIds: [uid(1)] })).complete).toBe(true);
  });
  it("counts photos by phase", () => {
    const p = roomProgress(makeRoom(), state({ beforePhotoIds: [uid(1), uid(2)], afterPhotoIds: [uid(3)] }));
    expect([p.beforePhotos, p.afterPhotos]).toEqual([2, 1]);
  });
});

describe("turnoverProgress", () => {
  const property = makeProperty();
  const kitchenDone = state({ checked: ["counters", "sink", "oven"], beforePhotoIds: [uid(1)], afterPhotoIds: [uid(2)] });

  it("reports totals for an unstarted turnover", () => {
    const p = turnoverProgress(property, makeTurnover());
    expect(p).toMatchObject({ roomsDone: 0, roomsTotal: 2, itemsDone: 0, itemsTotal: 5, requiredDone: 0, requiredTotal: 4, photos: 0, complete: false });
  });
  it("adds up rooms, items and photos", () => {
    const t = makeTurnover({ roomStates: [kitchenDone, state({ roomId: "bath", checked: ["toilet"], afterPhotoIds: [uid(3)] })] });
    const p = turnoverProgress(property, t);
    expect(p).toMatchObject({ roomsDone: 1, itemsDone: 4, requiredDone: 3, beforePhotos: 1, afterPhotos: 2, photos: 3, complete: false });
    expect(p.incompleteRoomIds).toEqual(["bath"]);
  });
  it("is complete when every room is complete", () => {
    const bath = state({ roomId: "bath", checked: ["toilet", "towels"], afterPhotoIds: [uid(3)] });
    const p = turnoverProgress(property, makeTurnover({ roomStates: [kitchenDone, bath] }));
    expect(p.complete).toBe(true);
    expect(p.nextIncompleteRoomIndex).toBeNull();
  });
  it("names the current room and clamps an out-of-range index", () => {
    expect(turnoverProgress(property, makeTurnover({ currentRoomIndex: 1 })).currentRoomName).toBe("Bathroom");
    expect(turnoverProgress(property, makeTurnover({ currentRoomIndex: 9 })).currentRoomName).toBe("Bathroom");
  });
  it("handles a property without rooms", () => {
    const p = turnoverProgress(makeProperty({ rooms: [] }), makeTurnover());
    expect(p).toMatchObject({ roomsTotal: 0, roomsDone: 0, complete: true, currentRoomName: null, nextIncompleteRoomIndex: null });
  });
});

describe("nextIncompleteRoomIndex", () => {
  const property = makeProperty({
    rooms: [makeRoom({ id: "a", requiresAfterPhoto: false, items: [] }), makeRoom({ id: "b" }), makeRoom({ id: "c" })],
  });
  it("returns the current room when it is incomplete", () => {
    expect(nextIncompleteRoomIndex(property, makeTurnover({ currentRoomIndex: 1 }))).toBe(1);
  });
  it("skips complete rooms going forward", () => {
    expect(nextIncompleteRoomIndex(property, makeTurnover({ currentRoomIndex: 0 }))).toBe(1);
  });
  it("wraps around to earlier incomplete rooms", () => {
    const done = { checked: ["counters", "sink"], beforePhotoIds: [], afterPhotoIds: [uid(1)] };
    const t = makeTurnover({ currentRoomIndex: 2, roomStates: [{ roomId: "c", ...done }] });
    expect(nextIncompleteRoomIndex(property, t)).toBe(1);
  });
  it("starts from an explicit index", () => {
    expect(nextIncompleteRoomIndex(property, makeTurnover(), 2)).toBe(2);
  });
  it("returns null when everything is complete", () => {
    const only = makeProperty({ rooms: [makeRoom({ id: "a", requiresAfterPhoto: false, items: [] })] });
    expect(nextIncompleteRoomIndex(only, makeTurnover())).toBeNull();
  });
});
