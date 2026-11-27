import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = { title: "Ücretsiz başla" };

export default function Page() {
  return <SignupForm />;
}
