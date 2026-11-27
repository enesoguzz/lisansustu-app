import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Programlar" };

export default function Page() {
  return <ComingSoon title="Programlar" text="Yüksek lisans ve doktora ilanları çok yakında burada." />;
}
