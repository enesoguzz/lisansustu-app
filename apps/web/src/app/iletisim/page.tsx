import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "İletişim" };

export default function Page() {
  return <ComingSoon title="İletişim" text="İletişim bilgileri yakında." />;
}
