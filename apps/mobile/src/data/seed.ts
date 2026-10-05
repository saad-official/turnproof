// Development-only demo data: two properties, a turnover due in about an hour (reminder + widget
// countdown), one tomorrow, and two finished turnovers with stamped sample photos (one with an
// issue) so Today, History, the proof flow and the widgets have something to show.
import {
  addDaysToKey,
  addPhoto,
  completeRoom,
  finish,
  type Photo,
  type Property,
  start,
  toggleItem,
  type Turnover,
  turnoverWindow,
} from '@turnproof/shared';

import { deviceModelLabel } from '@/native/capture';
import { makeDemoPhoto } from '@/native/demo-photos';

import { createProperty, scheduleTurnover } from './actions';
import { saveIssue } from './issues-repo';
import { newId } from './mappers';
import { savePhoto } from './photos-repo';
import { listProperties } from './properties-repo';
import { updateSettings } from './settings-repo';
import { deviceTimeZone, todayKey } from './time';
import { saveTurnover } from './turnovers-repo';

const ROOM_COLORS: Record<'before' | 'after', { from: string; to: string }[]> = {
  before: [
    { from: '#8A7F72', to: '#5E554B' },
    { from: '#7D7468', to: '#4F4A44' },
    { from: '#93877A', to: '#6A6056' },
  ],
  after: [
    { from: '#FAF8F4', to: '#E1EFE6' },
    { from: '#FFFFFF', to: '#DDF1F2' },
    { from: '#F1EDE5', to: '#E1EFE6' },
  ],
};

async function demoPhoto(
  turnover: Turnover,
  roomId: string | null,
  phase: Photo['phase'],
  takenAt: number,
  colorIndex: number,
  fix: { lat: number; lng: number },
): Promise<Photo> {
  const id = newId(takenAt);
  const palette = phase === 'after' ? ROOM_COLORS.after : phase === 'issue' ? [{ from: '#E0633F', to: '#B5452A' }] : ROOM_COLORS.before;
  const file = await makeDemoPhoto(id, palette[colorIndex % palette.length]!);
  const at = new Date(takenAt).toISOString();
  const photo: Photo = {
    id,
    turnoverId: turnover.id,
    roomId,
    phase,
    localUri: file.localUri,
    remoteUrl: null,
    width: file.width,
    height: file.height,
    stamp: {
      takenAt: at,
      lat: fix.lat + (colorIndex % 3) * 0.00002,
      lng: fix.lng - (colorIndex % 2) * 0.00002,
      accuracyM: 8 + (colorIndex % 4) * 3,
      deviceModel: deviceModelLabel(),
      sha256: file.sha256,
      source: 'camera',
    },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
  savePhoto({ ...photo, uploadState: 'local', uploadAttempts: 0, uploadError: null, nextAttemptAt: null });
  return photo;
}

/** Runs a whole turnover through the shared state machine with back-dated times and sample photos. */
async function finishedTurnover(property: Property, dayKey: string, fix: { lat: number; lng: number }, withIssue: boolean): Promise<void> {
  const tz = deviceTimeZone();
  const { checkoutAt } = turnoverWindow(property, dayKey, tz);
  const startMs = Date.parse(checkoutAt) + 15 * 60_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  const must = (r: { ok: boolean; turnover: Turnover }) => {
    if (!r.ok) throw new Error('seed transition failed');
    return r.turnover;
  };
  let t: Turnover = {
    id: newId(Date.parse(checkoutAt) - 86_400_000),
    propertyId: property.id,
    scheduledFor: checkoutAt,
    status: 'scheduled',
    currentRoomIndex: 0,
    roomStates: [],
    createdAt: iso(Date.parse(checkoutAt) - 86_400_000),
    updatedAt: iso(Date.parse(checkoutAt) - 86_400_000),
    deletedAt: null,
  };
  t = must(start(t, property, iso(startMs)));
  let clock = startMs;
  for (const [i, room] of property.rooms.entries()) {
    clock += 60_000;
    t = must(addPhoto(t, await demoPhoto(t, room.id, 'before', clock, i, fix)));
    for (const item of room.items) {
      clock += 45_000;
      t = must(toggleItem(t, room.id, item.id));
    }
    clock += 60_000;
    t = must(addPhoto(t, await demoPhoto(t, room.id, 'after', clock, i, fix)));
    t = must(completeRoom(t, property, room.id, iso(clock)));
  }
  if (withIssue && property.rooms[0]) {
    clock += 30_000;
    const photo = await demoPhoto(t, property.rooms[0].id, 'issue', clock, 0, fix);
    saveIssue({
      id: newId(clock),
      turnoverId: t.id,
      roomId: property.rooms[0].id,
      photoId: photo.id,
      severity: 'medium',
      note: 'Red wine stain on the duvet cover; swapped for a spare set.',
      createdAt: iso(clock),
      updatedAt: iso(clock),
      deletedAt: null,
    });
  }
  clock += 120_000;
  t = must(finish(t, property, iso(clock)));
  saveTurnover({ ...t, updatedAt: iso(clock) });
}

/**
 * Seeds demo data once (no-op when properties exist). Throws outside `__DEV__` so it can never run
 * in a release build. Takes a few seconds (it renders ~20 sample JPEGs).
 */
export async function seedDemoData(): Promise<{ seeded: boolean }> {
  if (!__DEV__) throw new Error('seedDemoData is development-only');
  if (listProperties().length) return { seeded: false };

  updateSettings({ onboarded: true, role: 'cleaner', displayName: 'Sam' });
  const soon = new Date(Date.now() + 70 * 60_000);
  const hhmm = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;

  const maple = await createProperty({
    name: 'Maple St Loft',
    address: '41 Maple St, Unit 3',
    lat: 43.6532,
    lng: -79.3832,
    checkoutTime: hhmm,
    checkinTime: '16:00',
    accessNotes: 'Lockbox on the side gate, code 2468. Spare linen in the hall closet.',
  });
  const harbour = await createProperty({
    name: 'Harbour View Cottage',
    address: '7 Harbour Rd',
    lat: 44.6488,
    lng: -63.5752,
    checkoutTime: '10:00',
    checkinTime: '15:00',
    fromTemplate: ['kitchen', 'bathroom', 'bedroom', 'bedroom', 'outdoor'],
  });

  const tz = deviceTimeZone();
  const today = todayKey(tz);
  await scheduleTurnover(maple.id, today); // checkout ≈ 70 min from now → reminder in ~10 min (60 min lead)
  await scheduleTurnover(harbour.id, addDaysToKey(today, 1));
  await scheduleTurnover(maple.id, addDaysToKey(today, 3));

  await finishedTurnover(maple, addDaysToKey(today, -2), { lat: 43.6532, lng: -79.3832 }, true);
  await finishedTurnover(harbour, addDaysToKey(today, -5), { lat: 44.6488, lng: -63.5752 }, false);
  return { seeded: true };
}
