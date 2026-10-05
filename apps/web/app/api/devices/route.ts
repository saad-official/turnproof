import { errorResponse, readJson } from "@/app/api/_lib/respond";
import { requireUser } from "@/app/api/_lib/session";
import { getDb } from "@/lib/db/client";
import { registerDevice, registerDeviceSchema } from "@/lib/services/devices";

/** Registers this install's Expo push token: `{ token: "ExponentPushToken[...]", platform: "ios" | "android" }`. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = await readJson(request, registerDeviceSchema);
    await registerDevice(await getDb(), user.id, input);
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "devices register");
  }
}
