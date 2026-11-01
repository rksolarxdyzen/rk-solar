import { redirect } from "next/navigation";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { PartyDirectory } from "@/components/inventory/party-directory";
import { getInventoryAccess } from "@/lib/inventory/queries";
import { createClient } from "@/lib/supabase/server";
import type { InventoryParty, InventoryPartyKind } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

export default async function InventoryPartiesPage() {
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canView) redirect("/");
  if (!ctx.access.canDispatch && !ctx.access.canManageItems) redirect("/inventory");

  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_parties")
    .select("id,name,kind,phone,city,address,gstin,is_active")
    .order("name");
  const parties: InventoryParty[] = (data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    kind: p.kind as InventoryPartyKind,
    phone: (p.phone as string | null) ?? null,
    city: (p.city as string | null) ?? null,
    address: (p.address as string | null) ?? null,
    gstin: (p.gstin as string | null) ?? null,
    is_active: Boolean(p.is_active),
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <InventoryHeader
        title="Companies / dealers / vendors"
        subtitle="B2B destinations for dispatch and return (not On-Floor customers)"
        backHref="/inventory"
        access={ctx.access}
        actions={false}
      />
      <PartyDirectory initial={parties} />
    </div>
  );
}
