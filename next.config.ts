import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
   allowedDevOrigins: ['10.10.28.200'],
  cacheComponents: true,
  partialPrefetching: true,
  // The open route database is read from disk at runtime (src/lib/free/routes.ts) — ship it with every route.
  outputFileTracingIncludes: {
    "/**": ["src/data/routes.txt"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
