import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

/** Proof pages (/p/*) are private links: never crawled (and noindex on the page itself). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/p/"] },
    sitemap: `${publicEnv.appUrl}/sitemap.xml`,
  };
}
