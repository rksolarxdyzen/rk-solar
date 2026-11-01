import { redirect } from "next/navigation";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { LowStockCard } from "@/components/inventory/low-stock-card";
import { loadDashboardData } from "@/lib/dashboard/load-dashboard";
import { getInventoryAccess } from "@/lib/inventory/queries";

/** First load after login stays a Server Component (avoids SoftLink/lazy Flight crashes). */
export default async function DashboardPage() {
  const data = await loadDashboardData();
  if (!data) redirect("/login");
  const inv = await getInventoryAccess();
  return (
    <>
      {inv?.access.canView ? <LowStockCard /> : null}
      <DashboardHome data={data} />
    </>
  );
}
