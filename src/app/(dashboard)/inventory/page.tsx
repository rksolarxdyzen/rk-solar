import { redirect } from "next/navigation";
import { StatCard } from "@/components/ui/card";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { StockList } from "@/components/inventory/stock-list";
import { getInventoryAccess, getStockList } from "@/lib/inventory/queries";
import { formatInr } from "@/lib/inventory/format";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canView) redirect("/");

  const rows = await getStockList(ctx.access.canViewCost);
  const active = rows.filter((r) => r.is_active);
  const low = active.filter((r) => r.is_low).length;
  const out = active.filter((r) => r.is_out).length;
  const totalValue = active.reduce((sum, r) => sum + (r.stock_value ?? 0), 0);
  const missingCost = active.reduce((sum, r) => sum + r.missing_cost_count, 0);

  return (
    <div>
      <InventoryHeader title="Inventory" subtitle="Stock, serial numbers, and material movement" access={ctx.access} />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Items" value={active.length} />
        <StatCard label="Low stock" value={low} color={low > 0 ? "warn" : "default"} />
        <StatCard label="Out of stock" value={out} color={out > 0 ? "error" : "default"} />
        {ctx.access.canViewCost && (
          <StatCard
            label="Stock value"
            value={formatInr(totalValue)}
            sub={missingCost > 0 ? `${missingCost} item(s)/unit(s) have no cost yet` : "At purchase cost"}
            color="primary"
          />
        )}
      </div>

      <StockList rows={rows} showValue={ctx.access.canViewCost} canManage={ctx.access.canManageItems} />
    </div>
  );
}
