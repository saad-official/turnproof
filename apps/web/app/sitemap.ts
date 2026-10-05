import type { MetadataRoute } from "next";
import { publicEnv } from "@/lib/env";

const PATHS = ["/", "/example", "/privacy", "/terms", "/support"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((path) => ({ url: `${publicEnv.appUrl}${path === "/" ? "" : path}` }));
}
