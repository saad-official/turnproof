import { roomProgress, roomStateFor, turnoverProgress } from "./checklist";
import type { CsvCell } from "./csv";
import { formatMinutes } from "./schedule";
import type { Issue, IssueSeverity, Photo, PhotoPhase, PhotoSource, Property, RoomKind, Turnover, TurnoverStatus } from "./schemas";
import { type StampFailure, type StampNote, stampIsVerified, stampLabel } from "./stamp";
import { dayKeyOf, type IsoString, localTime } from "./tz";

export interface ReportOptions {
  /** `Settings.stampGps` of the capturing user (drives the `no-gps` note). Default true. */
  stampGps?: boolean;
  /** Locale for stamp labels and dates. Default en-GB. */
  locale?: string;
  /** Include the street address. Default false for the public proof page. */
  includeAddress?: boolean;
}

export interface PhotoRef {
  id: string;
  phase: PhotoPhase;
  source: PhotoSource;
  /** `remoteUrl`, else `localUri`, else null. */
  url: string | null;
  width: number;
  height: number;
  takenAt: IsoString;
  stampLabel: string;
  verified: boolean;
  reasons: StampFailure[];
  notes: StampNote[];
}

export interface IssueRef {
  id: string;
  severity: IssueSeverity;
  note: string;
  roomId: string | null;
  createdAt: IsoString;
  photo: PhotoRef | null;
}

export interface ProofChecklistItem {
  id: string;
  label: string;
  required: boolean;
  checked: boolean;
}

export interface ProofRoom {
  roomId: string;
  name: string;
  kind: RoomKind;
  complete: boolean;
  doneAt: IsoString | null;
  checklist: { items: ProofChecklistItem[]; checkedRequired: number; totalRequired: number; checkedAll: number; totalAll: number };
  before: PhotoRef[];
  after: PhotoRef[];
  /** Gallery or reference shots for this room; never proof. */
  references: PhotoRef[];
  issues: IssueRef[];
}

export interface ProofTotals {
  roomsDone: number;
  roomsTotal: number;
  itemsDone: number;
  itemsTotal: number;
  /** Before + after proof photos. */
  photos: number;
  verifiedPhotos: number;
  referencePhotos: number;
  issues: number;
  issuesBySeverity: Record<IssueSeverity, number>;
}

/** View model for the public proof page (`/p/[slug]`). Carries no account, access-note or invite details. */
export interface ProofModel {
  property: { name: string; address: string | null };
  turnover: {
    id: string;
    status: TurnoverStatus;
    scheduledFor: IsoString;
    startedAt: IsoString | null;
    finishedAt: IsoString | null;
    durationSeconds: number | null;
    durationLabel: string | null;
    forced: boolean;
    note: string | null;
  };
  rooms: ProofRoom[];
  /** Issues not tied to a room. */
  generalIssues: IssueRef[];
  totals: ProofTotals;
  /** At least one proof photo and every proof photo verified. */
  allVerified: boolean;
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2 };
const byTakenAt = (a: PhotoRef, b: PhotoRef) => Date.parse(a.takenAt) - Date.parse(b.takenAt);

/** Build the public proof page model. Photos and issues of other turnovers and soft-deleted rows are ignored. */
export function proofModel(
  property: Property,
  turnover: Turnover,
  photos: readonly Photo[],
  issues: readonly Issue[],
  tz: string,
  options: ReportOptions = {},
): ProofModel {
  const live = photos.filter((p) => p.turnoverId === turnover.id && !p.deletedAt);
  const photoById = new Map(live.map((p) => [p.id, p]));
  const ref = (p: Photo): PhotoRef => {
    const v = stampIsVerified(p.stamp, turnover, { stampGps: options.stampGps });
    return {
      id: p.id,
      phase: p.phase,
      source: p.stamp.source,
      url: p.remoteUrl ?? p.localUri ?? null,
      width: p.width,
      height: p.height,
      takenAt: p.stamp.takenAt,
      stampLabel: stampLabel(p.stamp, tz, options.locale),
      verified: v.verified,
      reasons: v.reasons,
      notes: v.notes,
    };
  };
  const refsFor = (ids: readonly string[]) =>
    ids
      .map((id) => photoById.get(id))
      .filter((p): p is Photo => !!p)
      .map(ref)
      .sort(byTakenAt);

  const liveIssues = issues
    .filter((i) => i.turnoverId === turnover.id && !i.deletedAt)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const issueRef = (i: Issue): IssueRef => {
    const photo = i.photoId ? photoById.get(i.photoId) : undefined;
    return { id: i.id, severity: i.severity, note: i.note, roomId: i.roomId ?? null, createdAt: i.createdAt, photo: photo ? ref(photo) : null };
  };
  const roomIds = new Set(property.rooms.map((r) => r.id));

  const rooms: ProofRoom[] = property.rooms.map((room) => {
    const state = roomStateFor(turnover, room.id);
    const p = roomProgress(room, state);
    const checked = new Set(state?.checked ?? []);
    return {
      roomId: room.id,
      name: room.name,
      kind: room.kind,
      complete: p.complete,
      doneAt: state?.doneAt ?? null,
      checklist: {
        items: room.items.map((i) => ({ id: i.id, label: i.label, required: i.required, checked: checked.has(i.id) })),
        checkedRequired: p.checkedRequired,
        totalRequired: p.totalRequired,
        checkedAll: p.checkedAll,
        totalAll: p.totalAll,
      },
      before: refsFor(state?.beforePhotoIds ?? []),
      after: refsFor(state?.afterPhotoIds ?? []),
      references: live
        .filter((ph) => ph.phase === "reference" && ph.roomId === room.id)
        .map(ref)
        .sort(byTakenAt),
      issues: liveIssues.filter((i) => i.roomId === room.id).map(issueRef),
    };
  });

  const proofPhotos = rooms.flatMap((r) => [...r.before, ...r.after]);
  const progress = turnoverProgress(property, turnover);
  const issuesBySeverity: Record<IssueSeverity, number> = { low: 0, medium: 0, high: 0 };
  for (const i of liveIssues) issuesBySeverity[i.severity]++;
  const verifiedPhotos = proofPhotos.filter((p) => p.verified).length;
  const durationSeconds = turnover.durationSeconds ?? null;

  return {
    property: { name: property.name, address: options.includeAddress ? (property.address ?? null) : null },
    turnover: {
      id: turnover.id,
      status: turnover.status,
      scheduledFor: turnover.scheduledFor,
      startedAt: turnover.startedAt ?? null,
      finishedAt: turnover.finishedAt ?? null,
      durationSeconds,
      durationLabel: durationSeconds === null ? null : formatMinutes(Math.round(durationSeconds / 60)),
      forced: !!turnover.forced,
      note: turnover.note ?? null,
    },
    rooms,
    generalIssues: liveIssues.filter((i) => !i.roomId || !roomIds.has(i.roomId)).map(issueRef),
    totals: {
      roomsDone: progress.roomsDone,
      roomsTotal: progress.roomsTotal,
      itemsDone: progress.itemsDone,
      itemsTotal: progress.itemsTotal,
      photos: proofPhotos.length,
      verifiedPhotos,
      referencePhotos: rooms.reduce((n, r) => n + r.references.length, 0),
      issues: liveIssues.length,
      issuesBySeverity,
    },
    allVerified: proofPhotos.length > 0 && verifiedPhotos === proofPhotos.length,
  };
}

export interface TurnoverPdfModel extends ProofModel {
  title: string;
  /** Local date of `scheduledFor`, e.g. "Tue, 6 Oct 2026". */
  subtitle: string;
  summary: string[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Single-turnover PDF (expo-print): the proof model plus title and summary lines. Includes the address by default. */
export function turnoverPdfModel(
  property: Property,
  turnover: Turnover,
  photos: readonly Photo[],
  issues: readonly Issue[],
  tz: string,
  options: ReportOptions = {},
): TurnoverPdfModel {
  const model = proofModel(property, turnover, photos, issues, tz, { includeAddress: true, ...options });
  const t = model.totals;
  const summary: string[] = [];
  if (model.turnover.durationLabel) summary.push(`Duration ${model.turnover.durationLabel}`);
  summary.push(`${t.roomsDone}/${t.roomsTotal} rooms complete`, `${t.itemsDone}/${t.itemsTotal} checklist items`);
  summary.push(`${plural(t.photos, "photo")} (${t.verifiedPhotos} verified)`);
  const high = t.issuesBySeverity.high;
  summary.push(t.issues === 0 ? "No issues" : `${plural(t.issues, "issue")}${high ? ` (${high} high)` : ""}`);
  if (model.turnover.forced) summary.push(`Finished with incomplete rooms: ${model.turnover.note ?? ""}`.trim());
  const subtitle = new Intl.DateTimeFormat(options.locale ?? "en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(turnover.scheduledFor));
  return { ...model, title: `Turnover · ${property.name}`, subtitle, summary };
}

export const CSV_HEADER = [
  "Date",
  "Property",
  "Scheduled",
  "Status",
  "Started",
  "Finished",
  "Duration (min)",
  "Rooms done",
  "Rooms",
  "Items done",
  "Items",
  "Photos",
  "Issues",
  "Forced",
  "Note",
];

const localStamp = (instant: IsoString | null | undefined, tz: string) => (instant ? `${dayKeyOf(instant, tz)} ${localTime(instant, tz)}` : "");

/** History export: header row, then one row per non-deleted turnover by `scheduledFor`, in local time of `tz`. */
export function toCsvRows(turnovers: readonly Turnover[], properties: readonly Property[], tz: string, issues: readonly Issue[] = []): CsvCell[][] {
  const propertyById = new Map(properties.map((p) => [p.id, p]));
  const issueCount = new Map<string, number>();
  for (const i of issues) if (!i.deletedAt) issueCount.set(i.turnoverId, (issueCount.get(i.turnoverId) ?? 0) + 1);
  const rows = turnovers
    .filter((t) => !t.deletedAt)
    .sort((a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor))
    .map((t): CsvCell[] => {
      const property = propertyById.get(t.propertyId);
      const p = property ? turnoverProgress(property, t) : null;
      return [
        dayKeyOf(t.scheduledFor, tz),
        property?.name ?? "(deleted property)",
        localTime(t.scheduledFor, tz),
        t.status,
        localStamp(t.startedAt, tz),
        localStamp(t.finishedAt, tz),
        t.durationSeconds == null ? "" : Math.round(t.durationSeconds / 60),
        p ? p.roomsDone : "",
        p ? p.roomsTotal : "",
        p ? p.itemsDone : "",
        p ? p.itemsTotal : "",
        p ? p.photos : "",
        issueCount.get(t.id) ?? 0,
        t.forced ? "yes" : "",
        t.note ?? "",
      ];
    });
  return [[...CSV_HEADER], ...rows];
}
