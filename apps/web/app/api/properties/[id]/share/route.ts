import { errorResponse } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { shareProperty } from "@/lib/services/properties";

/**
 * Owner: share a synced property. `{ property }` with its invite code (made on
 * the first call; later calls return the same code). 403 for other members,
 * 404 when the property is unknown or the caller is not in it (push it first).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    return Response.json({ property: await shareProperty(await getDb(), user.id, id) });
  } catch (error) {
    return errorResponse(error, "properties share");
  }
}
