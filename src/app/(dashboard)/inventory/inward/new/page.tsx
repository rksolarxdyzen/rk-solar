import { redirect } from "next/navigation";
import Link from "next/link";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { InwardForm } from "@/components/inventory/inward-form";
import { getInventoryAccess, getPickerItems } from "@/lib/inventory/queries";

export const dynamic = "force-dynamic";

export default async function NewInwardPage() {
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canInward) redirect("/inventory");
  const items = await getPickerItems();

  return (
    <div className="mx-auto max-w-4xl">
      <InventoryHeader title="Stock inward" subtitle="Receive material into the store" backHref="/inventory" actions={false} />
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        Have a supplier PDF or photo?{" "}
        <Link href="/inventory/inward/import" className="font-semibold text-[var(--primary)] hover:underline">
          Import invoice / challan
        </Link>
        .
      </p>
      <InwardForm items={items} canManageCost={ctx.access.canManageCost} />
    </div>
  );
}
