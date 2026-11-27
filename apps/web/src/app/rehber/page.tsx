import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Rehberler" };

export default function Page() {
  return <ComingSoon title="Rehberler" text="Başvuru ve tez rehberleri çok yakında." />;
}
