import type { Room, RoomKind } from "./schemas";

export interface TemplateItem {
  label: string;
  required: boolean;
}

export interface RoomTemplate {
  name: string;
  items: readonly TemplateItem[];
  requiresAfterPhoto: boolean;
}

const req = (label: string): TemplateItem => ({ label, required: true });
const opt = (label: string): TemplateItem => ({ label, required: false });

/** Starting checklists per room kind; every property room is copied from one and then editable. */
export const ROOM_TEMPLATES: Readonly<Record<RoomKind, RoomTemplate>> = {
  bedroom: {
    name: "Bedroom",
    requiresAfterPhoto: true,
    items: [
      req("Strip bed"),
      req("Fresh linen and made bed"),
      req("Check under bed"),
      req("Dust surfaces and nightstands"),
      req("Mirrors"),
      req("Vacuum or mop floor"),
      opt("Hangers in closet"),
    ],
  },
  bathroom: {
    name: "Bathroom",
    requiresAfterPhoto: true,
    items: [
      req("Toilet cleaned inside and out"),
      req("Shower / tub scrubbed"),
      req("Sink and counter"),
      req("Mirror"),
      req("Towels restocked"),
      req("Toiletries restocked"),
      req("Floor mopped"),
      req("Bin emptied"),
    ],
  },
  kitchen: {
    name: "Kitchen",
    requiresAfterPhoto: true,
    items: [
      req("Counters wiped"),
      req("Stovetop"),
      opt("Oven checked"),
      req("Microwave inside"),
      req("Fridge emptied and wiped"),
      req("Dishwasher run and emptied"),
      req("Sink"),
      req("Floor mopped"),
      req("Bins emptied"),
      req("Fresh dish towels"),
    ],
  },
  living: {
    name: "Living room",
    requiresAfterPhoto: true,
    items: [req("Dust surfaces"), req("Cushions and throws arranged"), req("Remotes in place"), req("Vacuum floor"), opt("Windows spot-check")],
  },
  entry: {
    name: "Entry",
    requiresAfterPhoto: true,
    items: [req("Door and handles wiped"), req("Keys / lockbox reset"), req("Floor"), req("Lights off")],
  },
  outdoor: {
    name: "Outdoor",
    requiresAfterPhoto: true,
    items: [req("Furniture wiped and arranged"), opt("BBQ grill cleaned"), req("Outdoor bins emptied")],
  },
  laundry: {
    name: "Laundry",
    requiresAfterPhoto: false,
    items: [req("Machines emptied"), req("Dryer lint trap cleared"), req("Detergent supplies restocked")],
  },
  other: {
    name: "Room",
    requiresAfterPhoto: true,
    items: [req("Surfaces"), req("Floor")],
  },
};

/** Default restock list for a new property. */
export const DEFAULT_SUPPLIES: readonly string[] = [
  "Toilet paper",
  "Paper towels",
  "Hand soap",
  "Dish soap",
  "Shampoo",
  "Conditioner",
  "Body wash",
  "Coffee",
  "Trash bags",
  "Dishwasher tabs",
];

/** A new room of `kind` with fresh ids from `idFactory` (room first, then items in order). */
export function newRoomFromTemplate(kind: RoomKind, idFactory: () => string, name?: string): Room {
  const t = ROOM_TEMPLATES[kind];
  return {
    id: idFactory(),
    name: name ?? t.name,
    kind,
    items: t.items.map((i) => ({ id: idFactory(), label: i.label, required: i.required })),
    requiresAfterPhoto: t.requiresAfterPhoto,
  };
}

/** Walk-through order for a new property: beds first (laundry running), then wet rooms, then exit. */
export const DEFAULT_ROOM_KINDS: readonly RoomKind[] = ["bedroom", "bathroom", "kitchen", "living", "entry"];

export function defaultPropertyRooms(idFactory: () => string): Room[] {
  return DEFAULT_ROOM_KINDS.map((kind) => newRoomFromTemplate(kind, idFactory));
}
