import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Gizlilik" };

export default function Page() {
  return <ComingSoon title="Gizlilik" text="Metin yayından önce eklenecek." />;
}
