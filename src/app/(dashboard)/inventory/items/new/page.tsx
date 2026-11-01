import { redirect } from "next/navigation";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { ItemForm } from "@/components/inventory/item-form";
import { getInventoryAccess, getInventoryLookups } from "@/lib/inventory/queries";

export const dynamic = "force-dynamic";

export default async function NewInventoryItemPage() {
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canManageItems) redirect("/inventory");
  const lookups = await getInventoryLookups();

  return (
    <div className="mx-auto max-w-3xl">
      <InventoryHeader title="New item" backHref="/inventory" actions={false} />
      <ItemForm
        masterGroups={lookups.masterGroups}
        categories={lookups.categories}
        subcategories={lookups.subcategories}
        brands={lookups.brands}
        canViewCost={ctx.access.canViewCost}
        canManageCost={ctx.access.canManageCost}
      />
    </div>
  );
}
