import { errorResponse } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { revokeProof } from "@/lib/services/proofs";

/** Revokes a proof link (any member of the property). The page and its photos stop being served at once. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await params;
    return Response.json({ proof: await revokeProof(await getDb(), user.id, id) });
  } catch (error) {
    return errorResponse(error, "proofs revoke");
  }
}
