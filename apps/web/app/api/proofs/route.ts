import { errorResponse, readJson } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { listProofs, publishProof, publishProofSchema } from "@/lib/services/proofs";

/**
 * POST `{ turnoverId, expiresInDays?, timezone? }`: publish the turnover's proof
 * link (default 60 days). 201 `{ proof }` (shared `Proof` plus `url` and
 * `state`), or 200 with the link that is already live. 404 `turnover_not_found`,
 * 409 `turnover_not_finished`,
 * or 409 `photos_missing` with `details.missing` (photo ids still to upload).
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await readJson(request, publishProofSchema);
    const { proof, created } = await publishProof(await getDb(), user.id, input);
    return Response.json({ proof }, { status: created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error, "proofs publish");
  }
}

/**
 * GET `?turnoverId=`: `{ proofs }`, newest first, each with `url` and `state`
 * (active, expired, revoked). Without `turnoverId`: every proof of the caller's properties.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const turnoverId = new URL(request.url).searchParams.get("turnoverId");
    return Response.json({ proofs: await listProofs(await getDb(), user.id, turnoverId) });
  } catch (error) {
    return errorResponse(error, "proofs list");
  }
}
