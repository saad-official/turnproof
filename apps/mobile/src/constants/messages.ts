// Plain-language copy for the failure reasons the data layer and adapters return.
import type { ActionFailure, PublishProofResult } from '@/data';
import type { CaptureErrorCode } from '@/native/capture';

export function turnoverFailureMessage(reason: ActionFailure | 'invalid-photo' | 'invalid-issue' | string): string {
  switch (reason) {
    case 'not-found':
      return 'This turnover no longer exists.';
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
