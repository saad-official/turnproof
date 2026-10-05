import { errorResponse } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { deleteProperty } from "@/lib/services/properties";

/**
 * Owner only: delete the property for everyone. Its turnovers, issues, photos
 * (and stored bytes) and proof links are removed; the property row becomes a
 * tombstone members' phones pull. 403 for other members, 404 for anyone else.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    await deleteProperty(await getDb(), user.id, id);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "properties delete");
  }
}
