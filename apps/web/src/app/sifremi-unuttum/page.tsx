import type { Metadata } from "next";
import { ForgotForm } from "@/components/auth/forgot-form";
import { Fresh } from "@/components/auth/fresh";

export const metadata: Metadata = { title: "Şifremi unuttum" };

export default function Page() {
  return (
    <Fresh>
      <ForgotForm />
    </Fresh>
  );
}
