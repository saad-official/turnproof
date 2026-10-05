import { errorResponse } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { unregisterDevice } from "@/lib/services/devices";

/**
 * Unregisters an Expo push token (URL-encoded in the path) on sign-out or
 * when notifications are turned off. Only the owner's token is removed.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const user = await requireUser(request);
    const { token } = await params;
    const removed = await unregisterDevice(await getDb(), user.id, decodeURIComponent(token));
    return Response.json({ ok: true, removed });
  } catch (error) {
    return errorResponse(error, "devices unregister");
  }
}
