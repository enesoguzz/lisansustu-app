import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Yönetim", template: "%s | Yönetim" },
  // Yönetim sayfaları arama motorlarında görünmesin.
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
