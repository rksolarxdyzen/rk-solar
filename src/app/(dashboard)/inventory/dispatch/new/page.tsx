import { redirect } from "next/navigation";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { DispatchForm } from "@/components/inventory/dispatch-form";
import { getInventoryAccess, getPickerItems } from "@/lib/inventory/queries";
import { getCustomerById } from "@/lib/inventory/movements";
import { isCustomerSalesStage } from "@/lib/domain/workflow";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewDispatchPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canDispatch) redirect("/inventory");
  const { lead } = await searchParams;

  const [items, customer] = await Promise.all([
    getPickerItems(),
    lead && UUID_RE.test(lead) ? getCustomerById(lead) : Promise.resolve(null),
  ]);
  const initialCustomer =
    customer && isCustomerSalesStage(customer.sales_stage) ? customer : null;

  return (
    <div className="mx-auto max-w-4xl">
      <InventoryHeader title="Dispatch material" subtitle="Send stock to a customer site with a delivery challan" backHref="/inventory" actions={false} />
      <DispatchForm items={items} initialCustomer={initialCustomer} />
    </div>
  );
}
