import type { Metadata } from "next";
import { Suspense } from "react";
import { Fresh } from "@/components/auth/fresh";
import { UniversityPage } from "@/components/admin/university";
import { AdminGate, Loading } from "@/components/admin/ui";

export const metadata: Metadata = { title: "Üniversite" };

export default function Page() {
  return (
    <Fresh>
      <AdminGate>
        <Suspense fallback={<Loading />}>
          <UniversityPage />
        </Suspense>
      </AdminGate>
    </Fresh>
  );
}
