import type { Metadata } from "next";
import { Suspense } from "react";
import { Fresh } from "@/components/auth/fresh";
import { ListingPage } from "@/components/admin/listing";
import { AdminGate, Loading } from "@/components/admin/ui";

export const metadata: Metadata = { title: "İlan" };

export default function Page() {
  return (
    <Fresh>
      <AdminGate>
        <Suspense fallback={<Loading />}>
          <ListingPage />
        </Suspense>
      </AdminGate>
    </Fresh>
  );
}
