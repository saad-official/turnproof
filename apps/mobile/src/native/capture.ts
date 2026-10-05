// Proof capture: camera shot → resized, EXIF-free JPEG → sha256 over the exact bytes kept (and later
// uploaded) → optional location fix → file stored under `<document>/turnproof/photos/<id>.jpg`.
//
//   const cameraRef = useRef<CameraView>(null);
//   <CameraView ref={cameraRef} style={{ flex: 1 }} />
//   const shot = await takeProofPhoto(cameraRef);              // CaptureResult
//   await capturePhoto(turnoverId, roomId, 'before', shot);    // @/data actions: row + room state
//
// The re-encode through expo-image-manipulator is what strips EXIF (device, lens, orientation tags):
// the stamp we show (time, GPS, device model, hash) lives in the database row, not in the file.
// Gallery imports (`importReferencePhoto`) go through the same pipeline but carry
// `stamp.source = 'gallery'` and are only ever stored as `phase: 'reference'`.
import type { Stamp } from '@turnproof/shared';
import type { CameraView } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';

import { newId } from '@/data/mappers';
import { getSettings } from '@/data/settings-repo';

import { adoptPhotoFile, deletePhotoFile } from './photo-files';

/** Longest edge of a stored photo, in pixels. */
export const MAX_PHOTO_EDGE = 1600;
/** JPEG quality of the camera shot and of the stored re-encode. */
export const PHOTO_QUALITY = 0.85;
/** How long a capture waits for a location fix before stamping without one. */
export const LOCATION_TIMEOUT_MS = 8000;

/** A processed photo, ready for `capturePhoto(turnoverId, roomId, phase, result)`. */
export type CaptureResult = {
  /** The future photo row id (also the file name). */
  id: string;
  /** `file://…/turnproof/photos/<id>.jpg` */
  localUri: string;
  width: number;
  height: number;
  stamp: Stamp;
};

export type CaptureErrorCode = 'no-camera' | 'capture-failed' | 'processing-failed' | 'cancelled';

export class CaptureError extends Error {
  constructor(
    readonly code: CaptureErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CaptureError';
  }
}

type CameraRefLike = { current: CameraView | null } | CameraView | null | undefined;

const resolveCamera = (ref: CameraRefLike): CameraView | null =>
  !ref ? null : 'current' in (ref as object) ? (ref as { current: CameraView | null }).current : (ref as CameraView);

const toHex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

/** Lower-case hex SHA-256 of a file's bytes. */
export async function sha256OfFile(uri: string): Promise<string> {
  const bytes = await new File(uri).bytes();
  return toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
}

/** "Apple iPhone 15", "Google Pixel 8"; never empty (the stamp requires a device). */
export function deviceModelLabel(): string {
  const model = Device.modelName ?? Device.modelId ?? null;
  const maker = Device.manufacturer ?? Device.brand ?? null;
  const label = [maker, model].filter(Boolean).join(' ').trim();
  if (label) return label.slice(0, 120);
  return Device.osName ? `${Device.osName} device` : 'Unknown device';
}

// ---------------------------------------------------------------------------
// Location (one fix per photo, when-in-use permission only)

export type LocationPermission = { status: 'granted' | 'denied' | 'undetermined'; canAskAgain: boolean };

export async function getLocationPermission(): Promise<LocationPermission> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    return { status: p.granted ? 'granted' : p.status === 'undetermined' ? 'undetermined' : 'denied', canAskAgain: p.canAskAgain };
  } catch {
    return { status: 'denied', canAskAgain: false };
  }
}

/** Shows the when-in-use prompt (call from a priming screen, never on mount). */
export async function requestLocationPermission(): Promise<LocationPermission> {
  try {
    const p = await Location.requestForegroundPermissionsAsync();
    return { status: p.granted ? 'granted' : p.status === 'undetermined' ? 'undetermined' : 'denied', canAskAgain: p.canAskAgain };
  } catch {
    return { status: 'denied', canAskAgain: false };
  }
}

type Fix = { lat: number; lng: number; accuracyM: number | null };

/** One balanced-accuracy fix within `timeoutMs`, or null (no permission, services off, timeout). */
export async function oneLocationFix(timeoutMs = LOCATION_TIMEOUT_MS): Promise<Fix | null> {
  try {
    if ((await getLocationPermission()).status !== 'granted') return null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    });
    const fix = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then((pos): Fix => ({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyM: pos.coords.accuracy ?? null,
      }))
      .catch(() => null);
    const result = await Promise.race([fix, timeout]);
    if (timer) clearTimeout(timer);
    return result;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pipeline

/**
 * Re-encodes `sourceUri` as a JPEG whose long edge is at most `MAX_PHOTO_EDGE` (no EXIF), moves it
 * to the photos directory as `<id>.jpg` and hashes the stored bytes.
 */
async function processImage(sourceUri: string, id: string): Promise<{ localUri: string; width: number; height: number; sha256: string }> {
  const context = ImageManipulator.manipulate(sourceUri);
  try {
    const original = await context.renderAsync();
    let image = original;
    const longEdge = Math.max(original.width, original.height);
    if (longEdge > MAX_PHOTO_EDGE) {
      context.resize(original.width >= original.height ? { width: MAX_PHOTO_EDGE } : { height: MAX_PHOTO_EDGE });
      image = await context.renderAsync();
      original.release();
    }
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_QUALITY });
    image.release();
    const localUri = adoptPhotoFile(saved.uri, id);
    // Hash exactly what is stored and later uploaded (shared stamp rule).
    const sha256 = await sha256OfFile(localUri);
    return { localUri, width: saved.width, height: saved.height, sha256 };
  } finally {
    context.release();
  }
}

/**
 * Takes a proof photo with the screen's `CameraView` (pass the ref or the instance). Captures at
 * quality 0.85 without EXIF, resizes to ≤ 1600 px, hashes the final file, adds one location fix when
 * `settings.stampGps` is on and permission is granted (balanced accuracy, 8 s cap, omitted on failure),
 * records the device model, and returns the result with `stamp.source = 'camera'`.
 * Throws `CaptureError`.
 */
export async function takeProofPhoto(cameraRef: CameraRefLike, opts: { stampGps?: boolean } = {}): Promise<CaptureResult> {
  const camera = resolveCamera(cameraRef);
  if (!camera) throw new CaptureError('no-camera', 'The camera is not ready');
  const stampGps = opts.stampGps ?? getSettings().stampGps;
  // Start the location fix with the shutter so it overlaps capture and processing.
  const fixPromise = stampGps ? oneLocationFix() : Promise.resolve(null);
  const takenAt = new Date().toISOString();
  let tempUri: string;
  try {
    const shot = await camera.takePictureAsync({ quality: PHOTO_QUALITY, exif: false, base64: false, shutterSound: true });
    tempUri = shot.uri;
  } catch (error) {
    throw new CaptureError('capture-failed', error instanceof Error ? error.message : 'Capture failed');
  }
  const id = newId();
  let processed: Awaited<ReturnType<typeof processImage>>;
  try {
    processed = await processImage(tempUri, id);
  } catch (error) {
    throw new CaptureError('processing-failed', error instanceof Error ? error.message : 'Could not save the photo');
  } finally {
    deletePhotoFile(tempUri);
  }
  const fix = await fixPromise;
  const stamp: Stamp = {
    takenAt,
    ...(fix ? { lat: fix.lat, lng: fix.lng, accuracyM: fix.accuracyM } : {}),
    deviceModel: deviceModelLabel(),
    sha256: processed.sha256,
    source: 'camera',
  };
  return { id, localUri: processed.localUri, width: processed.width, height: processed.height, stamp };
}

/**
 * Picks one image from the library as a *reference* photo (`stamp.source = 'gallery'`, no GPS, the
 * import time as `takenAt`). Same resize / EXIF strip / hash as camera shots. Null when cancelled.
 * Store it with `capturePhoto(turnoverId, roomId, 'reference', result)`; it never counts as proof.
 */
export async function importReferencePhoto(): Promise<CaptureResult | null> {
  let picked: ImagePicker.ImagePickerResult;
  try {
    picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsMultipleSelection: false, exif: false, quality: 1 });
  } catch (error) {
    throw new CaptureError('capture-failed', error instanceof Error ? error.message : 'Could not open the library');
  }
  const asset = picked.canceled ? null : picked.assets[0];
  if (!asset) return null;
  const id = newId();
  let processed: Awaited<ReturnType<typeof processImage>>;
  try {
    processed = await processImage(asset.uri, id);
  } catch (error) {
    throw new CaptureError('processing-failed', error instanceof Error ? error.message : 'Could not import the photo');
  }
  const stamp: Stamp = {
    takenAt: new Date().toISOString(),
    deviceModel: deviceModelLabel(),
    sha256: processed.sha256,
    source: 'gallery',
  };
  return { id, localUri: processed.localUri, width: processed.width, height: processed.height, stamp };
}
