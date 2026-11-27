import type { Metadata } from "next";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Giriş yap" };

export default function Page() {
  return <ComingSoon title="Giriş yap" text="Üyelik sistemi bir sonraki adımda açılacak." />;
}
