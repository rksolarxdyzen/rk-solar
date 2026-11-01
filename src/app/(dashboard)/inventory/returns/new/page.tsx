import { redirect } from "next/navigation";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { ReturnForm } from "@/components/inventory/return-form";
import { getInventoryAccess } from "@/lib/inventory/queries";
import { getCustomerById, getCustomerMaterial } from "@/lib/inventory/movements";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewReturnPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canReturn) redirect("/inventory");
  const { lead } = await searchParams;

  const validLead = lead && UUID_RE.test(lead) ? lead : null;
  const [customer, material] = validLead
    ? await Promise.all([getCustomerById(validLead), getCustomerMaterial(validLead)])
    : [null, null];

  return (
    <div className="mx-auto max-w-4xl">
      <InventoryHeader title="Material return" subtitle="Take material back from a customer site" backHref="/inventory" actions={false} />
      <ReturnForm initialCustomer={customer} initialMaterial={customer ? material : null} />
    </div>
  );
}
