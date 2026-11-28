import type { Metadata } from "next";
import { Suspense } from "react";
import { Fresh } from "@/components/auth/fresh";
import { CallPage } from "@/components/admin/call";
import { AdminGate, Loading } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Dönem ilanı" };

export default function Page() {
  return (
    <Fresh>
      <AdminGate>
        <Suspense fallback={<Loading />}>
          <CallPage />
        </Suspense>
      </AdminGate>
    </Fresh>
  );
}
