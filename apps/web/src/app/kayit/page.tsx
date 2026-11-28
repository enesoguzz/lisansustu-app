import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/signup-form";
import { Fresh } from "@/components/auth/fresh";

export const metadata: Metadata = { title: "Ücretsiz başla" };

export default function Page() {
  return (
    <Fresh>
      <SignupForm />
    </Fresh>
  );
}
