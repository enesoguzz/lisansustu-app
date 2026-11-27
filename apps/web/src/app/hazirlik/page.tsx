import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Sınav Hazırlık" };

export default function Page() {
  return <ComingSoon title="Sınav Hazırlık" text="ALES, YDS ve diğer sınavlar için çalışma planları hazırlanıyor." />;
}
