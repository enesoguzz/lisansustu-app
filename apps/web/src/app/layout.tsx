import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { AuthProvider } from "@/components/auth/auth-provider";
import { MotionSettings } from "@/components/motion-settings";
import { SITE } from "@/lib/site";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: { default: `${SITE.name} | ${SITE.tagline}`, template: `%s | ${SITE.name}` },
  description: SITE.description,
};

export const viewport: Viewport = {
  themeColor: "#1a2e6e",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${nunito.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <MotionSettings>
          <AuthProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </AuthProvider>
        </MotionSettings>
      </body>
    </html>
  );
}
