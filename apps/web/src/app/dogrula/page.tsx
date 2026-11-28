import type { Metadata } from "next";
import { ConfirmLanding } from "@/components/auth/confirm-landing";
import { Fresh } from "@/components/auth/fresh";

export const metadata: Metadata = { title: "E-posta doğrulama", robots: { index: false } };

export default function Page() {
  return (
    <Fresh>
      <ConfirmLanding />
    </Fresh>
  );
}
