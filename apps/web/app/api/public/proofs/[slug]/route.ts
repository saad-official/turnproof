import { getDb } from "@/lib/db/client";
import { proofStatus } from "@/lib/services/proofs";

/**
 * `{ state }` of a proof link, for the proof page proxy (proxy.ts): 200
 * active, 410 expired or revoked, 404 unknown. Reveals nothing the page
 * itself would not.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };
  try {
    const state = await proofStatus(await getDb(), slug);
    const status = state === "active" ? 200 : state === "not_found" ? 404 : 410;
    return Response.json({ state }, { status, headers });
  } catch (error) {
    console.error("[api] proof status failed", error instanceof Error ? error.message : error);
    return Response.json({ error: "Something went wrong." }, { status: 500, headers });
  }
}
