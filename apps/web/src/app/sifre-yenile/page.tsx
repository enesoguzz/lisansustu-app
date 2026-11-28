import type { Metadata } from "next";
import { ResetLanding } from "@/components/auth/reset-landing";
import { Fresh } from "@/components/auth/fresh";

export const metadata: Metadata = { title: "Şifre yenileme", robots: { index: false } };

export default function Page() {
  return (
    <Fresh>
      <ResetLanding />
    </Fresh>
  );
}
