import { errorResponse } from "@/app/api/_lib/respond";
import { getAuth } from "@/lib/auth/server";
import { getDb } from "@/lib/db/client";
import { photoFileFor } from "@/lib/services/photos";

const NO_INDEX = "noindex, nofollow, noimageindex";

/**
 * A photo's uploaded bytes, for members of its property (session cookie) or
 * for anyone while its turnover has a live proof link. Otherwise 404.
 * Never indexed; cached briefly and privately so revocation takes effect fast.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    let userId: string | null = null;
    if (request.headers.get("cookie")) {
      const session = await (await getAuth()).api.getSession({ headers: request.headers });
      userId = session?.user.id ?? null;
    }
    const file = await photoFileFor(await getDb(), id, userId);
    return new Response(file.body as BodyInit, {
      headers: {
        "content-type": file.contentType,
        "cache-control": "private, max-age=300",
        "x-content-type-options": "nosniff",
        "x-robots-tag": NO_INDEX,
        "content-disposition": "inline",
      },
    });
  } catch (error) {
    const response = errorResponse(error, "photos file");
    response.headers.set("x-robots-tag", NO_INDEX);
    return response;
  }
}
