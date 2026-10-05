import { errorResponse } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { removeMember } from "@/lib/services/properties";

/**
 * Removes someone from a property. The owner can remove anyone else; everyone
 * else can only remove themselves (leave; `userId` may be `me`). The owner cannot leave.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const user = await requireUser(request);
    const { id, userId } = await params;
    await removeMember(await getDb(), user.id, id, userId);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "properties remove member");
  }
}
