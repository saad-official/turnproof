// Where proof photos live on the device: `<documentDirectory>/turnproof/photos/<photoId>.jpg`.
// The document directory is kept by the OS (not purged like the cache) and backed up on iOS.
import { Directory, File, Paths } from 'expo-file-system';

const ROOT = 'turnproof';
const PHOTOS = 'photos';

/** `<document>/turnproof/photos/`, created on first use. */
export function photosDirectory(): Directory {
  const dir = new Directory(Paths.document, ROOT, PHOTOS);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** The canonical file of a photo id (may not exist). */
export function photoFile(photoId: string): File {
  return new File(photosDirectory(), `${photoId}.jpg`);
}

/** Moves a temporary capture / manipulation result into the photos directory. Returns its URI. */
export function adoptPhotoFile(tempUri: string, photoId: string): string {
  const source = new File(tempUri);
  const target = photoFile(photoId);
  if (target.exists) target.delete();
  source.moveSync(target);
  return target.uri;
}

/** True when `uri` points at an existing file. */
export function fileExists(uri: string | null | undefined): boolean {
  if (!uri) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** File bytes (upload body / hashing). */
export async function readFileBytes(uri: string): Promise<Uint8Array> {
  return new File(uri).bytes();
}

/** Deletes a photo file; never throws. */
export function deletePhotoFile(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (error) {
    console.warn('[photo-files] delete failed', error);
  }
}

/** Deletes every stored photo (Delete all local data). */
export function deleteAllPhotoFiles(): void {
  try {
    const dir = new Directory(Paths.document, ROOT, PHOTOS);
    if (dir.exists) dir.delete();
  } catch (error) {
    console.warn('[photo-files] wipe failed', error);
  }
}

/** Free space in bytes on the app's volume (to warn before a long turnover), or null if unknown. */
export function availableDiskBytes(): number | null {
  try {
    return Paths.availableDiskSpace;
  } catch {
    return null;
  }
}
