import type { Metadata } from "next";
import { Account } from "@/components/auth/account";
import { Fresh } from "@/components/auth/fresh";

export const metadata: Metadata = { title: "Hesabım", robots: { index: false } };

export default function Page() {
  return (
    <Fresh>
      <Account />
    </Fresh>
  );
}
