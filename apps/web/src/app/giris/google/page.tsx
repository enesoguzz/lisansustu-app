import type { Metadata } from "next";
import { GoogleLanding } from "@/components/auth/google-landing";
import { Fresh } from "@/components/auth/fresh";

export const metadata: Metadata = { title: "Google ile giriş", robots: { index: false } };

export default function Page() {
  return (
    <Fresh>
      <GoogleLanding />
    </Fresh>
  );
}
