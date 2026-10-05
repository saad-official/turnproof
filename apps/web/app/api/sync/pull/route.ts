import { ApiError, errorResponse } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { IsoTimestamp } from "@/lib/sync/contract";
import { pullChanges } from "@/lib/services/sync";

/**
 * Rows of the caller's properties changed on the server after `?since=` (the
 * previous pull's `serverTime`; omit for everything), tombstones included.
 * Answer: `{ serverTime, tables: { properties, turnovers, issues, photos } }`.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const since = new URL(request.url).searchParams.get("since");
    if (since !== null && !IsoTimestamp.safeParse(since).success) {
      throw new ApiError(400, "`since` must be an ISO 8601 timestamp.", "invalid_since");
    }
    return Response.json(await pullChanges(await getDb(), user.id, since ? new Date(since) : undefined));
  } catch (error) {
    return errorResponse(error, "sync pull");
  }
}
