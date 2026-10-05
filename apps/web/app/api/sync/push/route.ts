import { errorResponse, readJson } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { SyncPushRequestSchema } from "@/lib/sync/contract";
import { pushChanges } from "@/lib/services/sync";

/**
 * Upserts the device's changed properties, turnovers, issues and photo
 * records (rules in lib/sync/contract.ts). Answer: `{ serverTime, accepted, rejected }`.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = await readJson(request, SyncPushRequestSchema);
    return Response.json(await pushChanges(await getDb(), user, body));
  } catch (error) {
    return errorResponse(error, "sync push");
  }
}
