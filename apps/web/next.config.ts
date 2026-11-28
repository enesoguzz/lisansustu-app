import type { NextConfig } from "next";

/** Her sayfayla birlikte gönderilen güvenlik başlıkları. */
const SECURITY_HEADERS = [
  // Site başka bir sitenin içinde çerçeve olarak açılamaz (görünmez çerçeveyle tıklatma tuzaklarına karşı).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Frame-Options", value: "DENY" },
  // Tarayıcı, dosyanın türünü içeriğine bakıp kendisi tahmin etmesin.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Başka bir siteye geçilirken yalnızca alan adı bildirilir, sayfanın adresi bildirilmez.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // packages/core TypeScript kaynağı olarak paylaşılıyor; Next derlemesine dahil et.
  transpilePackages: ["@lisansustu/core"],
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
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
