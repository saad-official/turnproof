// Plain-language copy for the failure reasons the data layer and adapters return.
import { ApiError, type ActionFailure, PropertyClientError, type PublishProofResult } from '@/data';
import type { CaptureErrorCode } from '@/native/capture';

export function turnoverFailureMessage(reason: ActionFailure | 'invalid-photo' | 'invalid-issue' | string): string {
  switch (reason) {
    case 'not-found':
      return 'This turnover no longer exists.';
    case 'in-progress':
      return 'This turnover is running. Finish or abandon it first.';
    case 'undo-expired':
      return 'Too late to undo: the turnover was already removed.';
    case 'not-in-progress':
      return 'This turnover is not running any more.';
    case 'not-scheduled':
      return 'This turnover has already started.';
    case 'already-closed':
      return 'This turnover is already closed.';
    case 'room-incomplete':
      return 'Finish the required items and take an after photo first.';
    case 'rooms-incomplete':
      return 'Some rooms are not done yet.';
    case 'note-required':
      return 'Add a note explaining why rooms were left unfinished.';
    case 'gallery-not-proof':
      return 'Library photos can only be added as reference photos.';
    case 'unknown-room':
      return 'That room is no longer part of this property.';
    case 'invalid-photo':
      return 'The photo could not be saved.';
    case 'invalid-issue':
      return 'Add a note or a photo to report an issue.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

const OFFLINE = "You're offline. Try again when you're connected.";

/** Copy for `joinProperty` / `shareProperty` rejections (and other API errors as a fallback). */
export function propertyErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof PropertyClientError) {
    switch (e.code) {
      case 'offline':
        return OFFLINE;
      case 'unauthorized':
        return 'Your session ended. Sign in again to continue.';
      case 'invite_not_found':
        return 'No property uses that code. Check it with your host.';
      case 'already_member':
        return 'You already have this property.';
      case 'server':
        return e.message || fallback;
    }
  }
  if (e instanceof ApiError) return e.status === 0 ? OFFLINE : e.message || fallback;
  return e instanceof Error ? e.message || fallback : fallback;
}

export function captureErrorMessage(code: CaptureErrorCode): string {
  switch (code) {
    case 'no-camera':
      return 'The camera is not ready yet.';
    case 'capture-failed':
      return 'The photo could not be taken. Try again.';
    case 'processing-failed':
      return 'The photo could not be saved. Check your free space.';
    case 'cancelled':
      return 'Cancelled.';
  }
}

type PublishFailure = Extract<PublishProofResult, { ok: false }>;

export function publishFailureMessage(r: PublishFailure): string {
  switch (r.reason) {
    case 'signed-out':
      return 'Sign in to publish a proof link.';
    case 'offline':
      return "You're offline. Photos will upload when you're back online.";
    case 'not-finished':
      return 'Finish the turnover before publishing.';
    case 'upload-failed':
      return r.failedUploads
        ? `${r.failedUploads} photo${r.failedUploads === 1 ? '' : 's'} could not upload. Try again.`
        : 'Some photos could not upload. Try again.';
    case 'sync-failed':
      return 'Could not sync with the server. Try again.';
    case 'server':
      return r.message ?? 'The server could not publish the link. Try again.';
    case 'not-found':
      return 'This turnover no longer exists.';
  }
}
