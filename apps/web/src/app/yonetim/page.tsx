import { Fresh } from "@/components/auth/fresh";
import { AdminGate } from "@/components/admin/ui";
import { Dashboard } from "@/components/admin/dashboard";

export default function Page() {
  return (
    <Fresh>
      <AdminGate>
        <Dashboard />
      </AdminGate>
    </Fresh>
  );
}
