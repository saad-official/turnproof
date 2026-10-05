import { errorResponse, readJson } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { createProperty, createPropertySchema, listProperties } from "@/lib/services/properties";

/**
 * POST: create and share a property from its wire row in one call:
 * `{ property, role?: "host" | "cleaner", displayName? }`. 201 `{ property }` with
 * the invite code; 200 when the caller already owns that id; 409
 * `property_exists` for someone else's id. (The app syncs properties and calls
 * `/api/properties/:id/share` instead.)
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await readJson(request, createPropertySchema);
    const { property, created } = await createProperty(await getDb(), user, input);
    return Response.json({ property }, { status: created ? 201 : 200 });
  } catch (error) {
    return errorResponse(error, "properties create");
  }
}

/**
 * GET: `{ properties: [{ propertyId, name, role, isOwner, inviteCode, createdAt, members: [{ userId, name, role, joinedAt, isMe }] }] }`,
 * every live property the caller is in (code for owners only, null until shared).
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json({ properties: await listProperties(await getDb(), user.id) });
  } catch (error) {
    return errorResponse(error, "properties list");
  }
}
