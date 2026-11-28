import type { Metadata } from "next";
import { Fresh } from "@/components/auth/fresh";
import { AdminGate } from "@/components/admin/ui";
import { ImportPage } from "@/components/admin/import";

export const metadata: Metadata = { title: "Dosyadan içe aktar" };

export default function Page() {
  return (
    <Fresh>
      <AdminGate>
        <ImportPage />
      </AdminGate>
    </Fresh>
  );
}
