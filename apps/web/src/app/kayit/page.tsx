import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Ücretsiz başla" };

export default function Page() {
  return <ComingSoon title="Ücretsiz başla" text="Üyelik sistemi bir sonraki adımda açılacak." />;
}
