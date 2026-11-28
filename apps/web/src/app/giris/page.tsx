import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { Fresh } from "@/components/auth/fresh";

export const metadata: Metadata = { title: "Giriş yap" };

export default function Page() {
  return (
    <Fresh>
      <LoginForm />
    </Fresh>
  );
}
