import type { Metadata } from "next";
import { Fresh } from "@/components/auth/fresh";
import { AdminGate } from "@/components/admin/ui";
import { UniversitiesPage } from "@/components/admin/university";

export const metadata: Metadata = { title: "Üniversiteler" };

export default function Page() {
  return (
    <Fresh>
      <AdminGate>
        <UniversitiesPage />
      </AdminGate>
    </Fresh>
  );
}
