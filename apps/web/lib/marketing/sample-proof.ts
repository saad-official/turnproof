import { proofModel, type ProofModel } from "@turnproof/shared/report";
import type { Issue, Photo, Property, Stamp, Turnover } from "@turnproof/shared/schemas";

/**
 * The /example page's data: an invented turnover rendered through the same
 * shared `proofModel` and page component as real proof links. Photos are
 * the drawings in /public/samples, each marked SAMPLE.
 */

export const SAMPLE_TIMEZONE = "America/Toronto";
const CREATED = "2026-10-01T12:00:00.000Z";
const id = (n: number) => `0199b3a0-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;

const property: Property = {
  id: id(1),
  name: "Maple St loft (sample)",
  address: "Not shown on proof pages",
  checkoutTime: "11:00",
  checkinTime: "16:00",
  rooms: [
    {
      id: "kitchen",
      name: "Kitchen",
      kind: "kitchen",
      requiresAfterPhoto: true,
      items: [
        { id: "counters", label: "Wipe counters and backsplash", required: true },
        { id: "dishes", label: "Dishes washed and put away", required: true },
        { id: "fridge", label: "Empty fridge of guest food", required: true },
        { id: "coffee", label: "Restock coffee pods", required: false },
      ],
    },
    {
      id: "bath",
      name: "Bathroom",
      kind: "bathroom",
      requiresAfterPhoto: true,
      items: [
        { id: "shower", label: "Scrub shower and glass", required: true },
        { id: "toilet", label: "Toilet, inside and out", required: true },
        { id: "towels", label: "Fresh towels ×4", required: true },
        { id: "tp", label: "Restock toilet paper", required: true },
      ],
    },
    {
      id: "bed",
      name: "Bedroom",
      kind: "bedroom",
      requiresAfterPhoto: true,
      items: [
        { id: "linen", label: "Fresh linen, hospital corners", required: true },
        { id: "floor", label: "Vacuum under the bed", required: true },
      ],
    },
  ],
  supplies: [],
  createdAt: CREATED,
  updatedAt: CREATED,
};

const at = (time: string) => `2026-10-06T${time}:00.000-04:00`;
const SHA = (n: number) => n.toString(16).padStart(2, "0").repeat(32);

function photo(n: number, roomId: string, phase: Photo["phase"], file: string, time: string, source: Stamp["source"] = "camera"): Photo {
  return {
    id: id(n),
    turnoverId: id(2),
    roomId,
    phase,
    remoteUrl: `/samples/${file}`,
    width: 800,
    height: 600,
    stamp: {
      takenAt: new Date(at(time)).toISOString(),
      lat: 43.6532,
      lng: -79.3832,
      accuracyM: 8,
      deviceModel: "Pixel 9",
      sha256: SHA(n),
      source,
    },
    createdAt: CREATED,
    updatedAt: CREATED,
  };
}

const photos: Photo[] = [
  photo(10, "kitchen", "before", "kitchen-before.svg", "10:06"),
  photo(11, "kitchen", "after", "kitchen-after.svg", "10:31"),
  photo(12, "bath", "before", "bathroom-before.svg", "10:34"),
  photo(13, "bath", "after", "bathroom-after.svg", "10:58"),
  photo(14, "bed", "before", "bedroom-before.svg", "11:01"),
  photo(15, "bed", "after", "bedroom-after.svg", "11:22"),
  photo(16, "bath", "issue", "issue-tile.svg", "10:41"),
  // Imported from the camera roll weeks earlier: shown, never proof.
  photo(17, "bed", "reference", "bedroom-after.svg", "09:00", "gallery"),
];
photos[7]!.stamp.takenAt = "2026-09-12T13:00:00.000Z";

const turnover: Turnover = {
  id: id(2),
  propertyId: property.id,
  scheduledFor: new Date(at("11:00")).toISOString(),
  startedAt: new Date(at("10:05")).toISOString(),
  finishedAt: new Date(at("11:25")).toISOString(),
  status: "finished",
  currentRoomIndex: 2,
  durationSeconds: 80 * 60,
  forced: false,
  roomStates: [
    { roomId: "kitchen", checked: ["counters", "dishes", "fridge"], beforePhotoIds: [id(10)], afterPhotoIds: [id(11)], doneAt: new Date(at("10:32")).toISOString() },
    { roomId: "bath", checked: ["shower", "toilet", "towels", "tp"], beforePhotoIds: [id(12)], afterPhotoIds: [id(13)], doneAt: new Date(at("10:59")).toISOString() },
    { roomId: "bed", checked: ["linen", "floor"], beforePhotoIds: [id(14)], afterPhotoIds: [id(15)], doneAt: new Date(at("11:23")).toISOString() },
  ],
  createdAt: CREATED,
  updatedAt: CREATED,
};

const issues: Issue[] = [
  {
    id: id(30),
    turnoverId: turnover.id,
    roomId: "bath",
    photoId: id(16),
    severity: "medium",
    note: "Cracked floor tile by the tub. It was like this when I arrived (see before photo).",
    createdAt: new Date(at("10:41")).toISOString(),
    updatedAt: new Date(at("10:41")).toISOString(),
  },
];

export function sampleProof(): { model: ProofModel; expiresAt: string } {
  return {
    model: proofModel(property, turnover, photos, issues, SAMPLE_TIMEZONE),
    expiresAt: new Date(Date.parse(turnover.finishedAt!) + 60 * 86_400_000).toISOString(),
  };
}
