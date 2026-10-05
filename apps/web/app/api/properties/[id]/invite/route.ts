import { errorResponse } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { rotateInviteCode } from "@/lib/services/properties";

/** Owner: issue a new invite code (`{ inviteCode }`); the old one stops working. People already in stay in. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    return Response.json({ inviteCode: await rotateInviteCode(await getDb(), user.id, id) });
  } catch (error) {
    return errorResponse(error, "properties invite");
  }
}
