import { NextResponse, type NextRequest } from "next/server";
import { colors, fontFamily } from "@turnproof/shared/tokens";

/**
 * Proof pages (`/p/<slug>`): expired and revoked links answer 410 Gone with a
 * plain page, which a server component cannot do. The proxy asks the status
 * route (`/api/public/proofs/<slug>`), which reads the database in the app's
 * own runtime, rather than opening a connection here. Active and unknown
 * links (and any failure of the check) continue to the page, which renders
 * the proof or a 404 itself. Every response is `noindex`.
 */

export const config = { matcher: ["/p/:slug"] };

const NO_INDEX = "noindex, nofollow, noimageindex";
const STATUS_TIMEOUT_MS = 3_000;

const MESSAGES = {
  expired: {
    title: "This proof link has expired",
    body: "Turnproof links stop working 60 days after they are shared. Ask the person who sent it for a new link if you still need the photos.",
  },
  revoked: {
    title: "This proof link was withdrawn",
    body: "The person who shared it turned the link off. Ask them for a new link if you still need the photos.",
  },
} as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** A self-contained page in the brand colours, no scripts. */
export function goneHtml(state: keyof typeof MESSAGES): string {
  const { title, body } = MESSAGES[state];
  const l = colors.light;
  const d = colors.dark;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="${NO_INDEX}"><title>${escapeHtml(title)} · Turnproof</title><style>
:root{color-scheme:light dark;--bg:${l.surface};--card:${l.surfaceElevated};--ink:${l.text};--ink2:${l.textSecondary};--accent:${l.accentText};--line:${l.separator}}
@media (prefers-color-scheme:dark){:root{--bg:${d.surface};--card:${d.surfaceElevated};--ink:${d.text};--ink2:${d.textSecondary};--accent:${d.accentText};--line:${d.separator}}}
body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:17px/1.5 ${fontFamily.web};padding:16px;box-sizing:border-box}
main{max-width:30rem;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:32px}
h1{font-size:24px;line-height:1.25;margin:0 0 12px}p{margin:0 0 16px;color:var(--ink2)}a{color:var(--accent)}
</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p><p><a href="/">What is Turnproof?</a></p></main></body></html>`;
}

export async function proofGate(request: NextRequest, fetcher: typeof fetch): Promise<NextResponse> {
  const slug = request.nextUrl.pathname.split("/")[2] ?? "";
  const pass = () => {
    const response = NextResponse.next();
    response.headers.set("x-robots-tag", NO_INDEX);
    return response;
  };
  let state: unknown;
  try {
    const statusUrl = new URL(`/api/public/proofs/${encodeURIComponent(slug)}`, request.nextUrl.origin);
    const response = await fetcher(statusUrl, { cache: "no-store", signal: AbortSignal.timeout(STATUS_TIMEOUT_MS) });
    if (response.status !== 410) return pass();
    state = ((await response.json()) as { state?: unknown }).state;
  } catch {
    return pass();
  }
  if (state !== "expired" && state !== "revoked") return pass();
  return new NextResponse(goneHtml(state), {
    status: 410,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": NO_INDEX, "cache-control": "no-store" },
  });
}

export function proxy(request: NextRequest) {
  return proofGate(request, fetch);
}
