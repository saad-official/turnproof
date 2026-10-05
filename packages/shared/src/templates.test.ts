import { ROOM_KINDS, RoomSchema } from "./schemas";
import { DEFAULT_SUPPLIES, defaultPropertyRooms, newRoomFromTemplate, ROOM_TEMPLATES } from "./templates";
import { counterIds } from "./fixtures.test-util";

const labels = (kind: keyof typeof ROOM_TEMPLATES) => ROOM_TEMPLATES[kind].items.map((i) => i.label.toLowerCase()).join(" | ");

describe("ROOM_TEMPLATES", () => {
  it("has a template for every room kind", () => {
    expect(Object.keys(ROOM_TEMPLATES).sort()).toEqual([...ROOM_KINDS].sort());
  });
  it("gives every kind a name and at least two items", () => {
    for (const kind of ROOM_KINDS) {
      expect(ROOM_TEMPLATES[kind].name.length, kind).toBeGreaterThan(0);
      expect(ROOM_TEMPLATES[kind].items.length, kind).toBeGreaterThanOrEqual(2);
    }
  });
  it("has no duplicate labels within a template", () => {
    for (const kind of ROOM_KINDS) {
      const ls = ROOM_TEMPLATES[kind].items.map((i) => i.label);
      expect(new Set(ls).size, kind).toBe(ls.length);
    }
  });
  it("covers the bathroom essentials", () => {
    for (const word of ["toilet", "shower", "sink", "mirror", "towels", "toiletries", "floor", "bin"]) expect(labels("bathroom")).toContain(word);
  });
  it("covers the kitchen essentials", () => {
    for (const word of ["counters", "stovetop", "oven", "microwave", "fridge", "dishwasher", "sink", "floor", "bins", "dish towels"]) {
      expect(labels("kitchen")).toContain(word);
    }
  });
  it("covers bedroom, living, entry, outdoor and laundry essentials", () => {
    for (const word of ["strip bed", "fresh linen", "under bed", "hangers"]) expect(labels("bedroom")).toContain(word);
    for (const word of ["cushions", "remotes", "windows"]) expect(labels("living")).toContain(word);
    for (const word of ["door", "lockbox", "lights"]) expect(labels("entry")).toContain(word);
    for (const word of ["furniture", "bbq", "bins"]) expect(labels("outdoor")).toContain(word);
    for (const word of ["machines emptied", "lint", "supplies"]) expect(labels("laundry")).toContain(word);
  });
  it("marks spot-checks as optional", () => {
    const windows = ROOM_TEMPLATES.living.items.find((i) => i.label.toLowerCase().includes("windows"));
    expect(windows?.required).toBe(false);
  });
});

describe("newRoomFromTemplate", () => {
  it("builds a valid room with fresh ids", () => {
    const room = newRoomFromTemplate("bathroom", counterIds());
    expect(RoomSchema.safeParse(room).success).toBe(true);
    expect(room.id).toBe("id-1");
    expect(room.items[0]?.id).toBe("id-2");
    expect(room.kind).toBe("bathroom");
    expect(room.name).toBe("Bathroom");
    expect(room.requiresAfterPhoto).toBe(true);
  });
  it("uses a custom name when given", () => {
    expect(newRoomFromTemplate("bedroom", counterIds(), "Primary bedroom").name).toBe("Primary bedroom");
  });
  it("copies items so templates are not mutated", () => {
    const room = newRoomFromTemplate("kitchen", counterIds());
    room.items[0]!.label = "changed";
    expect(ROOM_TEMPLATES.kitchen.items[0]?.label).not.toBe("changed");
  });
});

describe("defaultPropertyRooms", () => {
  it("returns bedroom, bathroom, kitchen, living and entry in walk-through order", () => {
    expect(defaultPropertyRooms(counterIds()).map((r) => r.kind)).toEqual(["bedroom", "bathroom", "kitchen", "living", "entry"]);
  });
  it("gives every room and item a unique id", () => {
    const rooms = defaultPropertyRooms(counterIds());
    const ids = rooms.flatMap((r) => [r.id, ...r.items.map((i) => i.id)]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("DEFAULT_SUPPLIES", () => {
  it("lists common restock items", () => {
    expect(DEFAULT_SUPPLIES).toContain("Toilet paper");
    expect(DEFAULT_SUPPLIES.length).toBeGreaterThanOrEqual(6);
  });
});
