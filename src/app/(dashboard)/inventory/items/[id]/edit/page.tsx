import { notFound, redirect } from "next/navigation";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { ItemForm } from "@/components/inventory/item-form";
import {
  getInventoryAccess,
  getInventoryItem,
  getInventoryLookups,
  getItemDefaultCost,
  itemHasMovements,
} from "@/lib/inventory/queries";

export const dynamic = "force-dynamic";

export default async function EditInventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canManageItems) redirect(`/inventory/items/${id}`);

  const [item, lookups, cost, moved] = await Promise.all([
    getInventoryItem(id),
    getInventoryLookups(),
    ctx.access.canViewCost
      ? getItemDefaultCost(id)
      : Promise.resolve({ default_unit_cost: null, gst_percent: null }),
    itemHasMovements(id),
  ]);
  if (!item) notFound();

  return (
    <div className="mx-auto max-w-3xl">
      <InventoryHeader title={`Edit ${item.name}`} backHref={`/inventory/items/${id}`} actions={false} />
      <ItemForm
        item={item}
        masterGroups={lookups.masterGroups}
        categories={lookups.categories}
        subcategories={lookups.subcategories}
        brands={lookups.brands}
        defaultCost={cost?.default_unit_cost ?? null}
        defaultGstPercent={cost?.gst_percent ?? null}
        canViewCost={ctx.access.canViewCost}
        canManageCost={ctx.access.canManageCost}
        hasMovements={moved}
      />
    </div>
  );
}
