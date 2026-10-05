import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, proofGate } from "@/proxy";

function request(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3900"));
}

function statusFetch(state: string | null, status = 200) {
  return vi.fn(async () =>
    state === null ? new Response("{}", { status: 404 }) : Response.json({ state }, { status }),
  ) as unknown as typeof fetch;
}

describe("proof page proxy", () => {
  it("only runs on /p/:slug", () => {
    expect(config.matcher).toEqual(["/p/:slug"]);
  });

  it("lets active proofs through to the page", async () => {
    const fetcher = statusFetch("active");
    const response = await proofGate(request("/p/abc123"), fetcher);
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(fetcher).toHaveBeenCalledWith(expect.objectContaining({ href: "http://localhost:3900/api/public/proofs/abc123" }), expect.anything());
  });

  it("answers expired and revoked links with a plain 410 page", async () => {
    for (const state of ["expired", "revoked"]) {
      const response = await proofGate(request("/p/abc123"), statusFetch(state, 410));
      expect(response.status).toBe(410);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
      const html = await response.text();
      expect(html).toContain(state === "expired" ? "expired" : "withdrawn");
      expect(html).not.toContain("<script");
    }
  });

  it("falls through to the page when the status check fails", async () => {
    const failing = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    expect((await proofGate(request("/p/abc123"), failing)).headers.get("x-middleware-next")).toBe("1");
    expect((await proofGate(request("/p/abc123"), statusFetch(null))).headers.get("x-middleware-next")).toBe("1");
  });
});
