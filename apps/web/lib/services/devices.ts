import "server-only";
import { and, eq } from "drizzle-orm";
import { Expo } from "expo-server-sdk";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import { devices, PLATFORMS } from "@/lib/db/schema";

export const registerDeviceSchema = z.object({
  token: z
    .string()
    .max(300)
    .refine((value) => Expo.isExpoPushToken(value), "Not an Expo push token."),
  platform: z.enum(PLATFORMS),
});
export type RegisterDevice = z.infer<typeof registerDeviceSchema>;

/**
 * Upserts by token. A token belongs to one install, so registering it from
 * another account (sign-out, sign-in as someone else) moves it there.
 */
export async function registerDevice(db: Db, userId: string, input: RegisterDevice, now = new Date()): Promise<void> {
  await db
    .insert(devices)
    .values({ userId, expoPushToken: input.token, platform: input.platform, lastSeenAt: now })
    .onConflictDoUpdate({
      target: devices.expoPushToken,
      set: { userId, platform: input.platform, lastSeenAt: now },
    });
}

/** Removes the token only if it belongs to `userId`. Returns whether a row was removed. */
export async function unregisterDevice(db: Db, userId: string, token: string): Promise<boolean> {
  const removed = await db
    .delete(devices)
    .where(and(eq(devices.userId, userId), eq(devices.expoPushToken, token)))
    .returning({ id: devices.id });
  return removed.length > 0;
}
