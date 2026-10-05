import type { NextConfig } from "next";

const NO_INDEX = "noindex, nofollow, noimageindex";

const nextConfig: NextConfig = {
  // Embedded Postgres for local development (lib/db/client.ts) loads its WASM
  // and data files from its own package directory at runtime; bundling breaks
  // those paths, so Node loads it from node_modules instead.
  serverExternalPackages: ["@electric-sql/pglite"],
  // The shared domain + tokens package ships TypeScript source.
  transpilePackages: ["@turnproof/shared"],
  poweredByHeader: false,
  images: {
    // Proof photos are served by the access-checked file route (lib/storage.ts);
    // the page renders them `unoptimized` so no optimizer cache outlives a
    // revoked or expired link. These patterns cover any optimised use.
    localPatterns: [
      { pathname: "/api/photos/**", search: "" },
      { pathname: "/samples/**", search: "" },
    ],
    remotePatterns: [{ protocol: "https", hostname: "*.blob.vercel-storage.com", pathname: "/photos/**", search: "" }],
  },
  async headers() {
    return [
      { source: "/p/:path*", headers: [{ key: "X-Robots-Tag", value: NO_INDEX }, { key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: NO_INDEX }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
