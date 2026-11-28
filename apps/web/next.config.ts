import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // packages/core TypeScript kaynağı olarak paylaşılıyor; Next derlemesine dahil et.
  transpilePackages: ["@lisansustu/core"],
  cacheComponents: true,
  partialPrefetching: true,
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
