import { errorResponse, readJson } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { joinProperty, joinPropertySchema } from "@/lib/services/properties";

/**
 * Joins a property by invite code: `{ code: "ABCD-2345", displayName?, role? }`.
 * 200 `{ property }`; 404 `invite_not_found`, 409 `already_member` / `property_full`.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await readJson(request, joinPropertySchema);
    return Response.json({ property: await joinProperty(await getDb(), user, input) });
  } catch (error) {
    return errorResponse(error, "properties join");
  }
}
