import type { Stamp, Turnover } from "./schemas";

/**
 * Proof stamps. The app hashes the captured file with expo-crypto (SHA-256, hex) at capture time and
 * stores it in the stamp; this module only validates and compares the hex strings.
 */

const SHA256_RE = /^[0-9a-f]{64}$/i;

/** 64 hex characters, either case. */
export function isSha256Hex(value: unknown): value is string {
  return typeof value === "string" && SHA256_RE.test(value);
}

/** Two valid digests that are equal ignoring case. */
export function sameSha256(a: string, b: string): boolean {
  return isSha256Hex(a) && isSha256Hex(b) && a.toLowerCase() === b.toLowerCase();
}

/** Grace either side of the turnover for clock skew and "before" shots taken just ahead of starting. */
export const STAMP_WINDOW_MINUTES = 10;

export type StampFailure =
  | "not-camera"
  | "invalid-hash"
  | "hash-mismatch"
  | "turnover-not-started"
  | "invalid-time"
  | "taken-before-start"
  | "taken-after-finish";
export type StampNote = "no-gps";

export const STAMP_REASON_TEXT: Readonly<Record<StampFailure | StampNote, string>> = {
  "not-camera": "Imported from the gallery, not captured in the app",
  "invalid-hash": "Missing or malformed content hash",
  "hash-mismatch": "The file does not match its recorded hash",
  "turnover-not-started": "The turnover was never started",
  "invalid-time": "Capture time is unreadable",
  "taken-before-start": "Taken before the turnover started",
  "taken-after-finish": "Taken after the turnover ended",
  "no-gps": "No location recorded",
};

export interface StampVerification {
  verified: boolean;
  /** Failures; any one of them withholds the "verified capture" badge. */
  reasons: StampFailure[];
  /** Informational only (shown next to the badge, never fails it). */
  notes: StampNote[];
}

export interface VerifyOptions {
  /** `Settings.stampGps`; when true (default) a stamp without coordinates gets a `no-gps` note. */
  stampGps?: boolean;
  /** A digest recomputed from the stored/uploaded file; when given it must match the stamp. */
  expectedSha256?: string;
}

/**
 * The "verified capture" badge: camera source, valid sha256 (matching `expectedSha256` when given),
 * and `takenAt` within [startedAt − 10 min, end + 10 min], where end is finishedAt or abandonedAt;
 * no upper bound while the turnover is still running.
 */
export function stampIsVerified(stamp: Stamp, turnover: Turnover, options: VerifyOptions = {}): StampVerification {
  const reasons: StampFailure[] = [];
  const notes: StampNote[] = [];
  if (stamp.source !== "camera") reasons.push("not-camera");
  if (!isSha256Hex(stamp.sha256)) reasons.push("invalid-hash");
  else if (options.expectedSha256 !== undefined && !sameSha256(stamp.sha256, options.expectedSha256)) reasons.push("hash-mismatch");

  const taken = Date.parse(stamp.takenAt);
  const grace = STAMP_WINDOW_MINUTES * 60_000;
  if (!turnover.startedAt) reasons.push("turnover-not-started");
  else if (Number.isNaN(taken)) reasons.push("invalid-time");
  else {
    const end = turnover.finishedAt ?? turnover.abandonedAt;
    if (taken < Date.parse(turnover.startedAt) - grace) reasons.push("taken-before-start");
    else if (end && taken > Date.parse(end) + grace) reasons.push("taken-after-finish");
  }

  if ((options.stampGps ?? true) && (stamp.lat == null || stamp.lng == null)) notes.push("no-gps");
  return { verified: reasons.length === 0, reasons, notes };
}

const MINUS = "−";
const coord = (n: number) => (n < 0 ? `${MINUS}${Math.abs(n).toFixed(2)}` : n.toFixed(2));

/**
 * Human stamp, e.g. "Tue 6 Oct, 14:02 · 43.65, −79.38 (±8 m)", in `tz` and `locale` (default en-GB).
 * Gallery imports end with "· From gallery".
 */
export function stampLabel(stamp: Stamp, tz: string, locale = "en-GB"): string {
  const at = new Date(stamp.takenAt);
  const day = new Intl.DateTimeFormat(locale, { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(at);
  const time = new Intl.DateTimeFormat(locale, { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(at);
  const parts = [`${day}, ${time}`];
  if (stamp.lat != null && stamp.lng != null) {
    const accuracy = stamp.accuracyM != null ? ` (±${Math.round(stamp.accuracyM)} m)` : "";
    parts.push(`${coord(stamp.lat)}, ${coord(stamp.lng)}${accuracy}`);
  }
  if (stamp.source === "gallery") parts.push("From gallery");
  return parts.join(" · ");
}
