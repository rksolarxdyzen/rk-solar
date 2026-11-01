import { redirect } from "next/navigation";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { OpeningStockImport } from "@/components/inventory/opening-stock-import";
import { getInventoryAccess, getInventoryLookups, getPickerItems } from "@/lib/inventory/queries";

export const dynamic = "force-dynamic";

export default async function OpeningStockImportPage() {
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canInward) redirect("/inventory");
  const [items, lookups] = await Promise.all([getPickerItems(), getInventoryLookups()]);

  return (
    <div className="mx-auto max-w-5xl">
      <InventoryHeader
        title="Opening stock import"
        subtitle="Load current store stock from Excel in one go"
        backHref="/inventory"
        actions={false}
      />
      <OpeningStockImport
        items={items}
        masterGroups={lookups.masterGroups}
        categories={lookups.categories}
        subcategories={lookups.subcategories}
        brands={lookups.brands}
        canManageCost={ctx.access.canManageCost}
      />
    </div>
  );
}
