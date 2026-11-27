import type { Metadata } from "next";
import { Account } from "@/components/auth/account";

export const metadata: Metadata = { title: "Hesabım" };

export default function Page() {
  return <Account />;
}
