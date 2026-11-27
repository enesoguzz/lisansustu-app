import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "KVKK Aydınlatma Metni" };

export default function Page() {
  return <ComingSoon title="KVKK Aydınlatma Metni" text="Metin yayından önce eklenecek." />;
}
