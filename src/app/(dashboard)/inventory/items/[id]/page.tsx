import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { StatCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { ItemDetailTabs } from "@/components/inventory/item-detail-tabs";
import { DeleteItemButton } from "@/components/inventory/delete-item-button";
import { createClient } from "@/lib/supabase/server";
import {
  getInventoryAccess,
  getInventoryItem,
  getItemDefaultCost,
  getItemHistory,
  getItemSerials,
} from "@/lib/inventory/queries";
import { formatInr, formatQty } from "@/lib/inventory/format";

export const dynamic = "force-dynamic";

export default async function InventoryItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canView) redirect("/");

  const item = await getInventoryItem(id);
  if (!item) notFound();

  const supabase = await createClient();
  const [history, serials, stock, value, cost] = await Promise.all([
    getItemHistory(id),
    item.track_serials ? getItemSerials(id) : Promise.resolve([]),
    supabase.from("inventory_stock_on_hand").select("on_hand,serials_dispatched,serials_defective,is_low,is_out").eq("item_id", id).maybeSingle(),
    ctx.access.canViewCost
      ? supabase.from("inventory_stock_value").select("stock_value,unit_cost").eq("item_id", id).maybeSingle()
      : Promise.resolve({ data: null }),
    ctx.access.canViewCost
      ? getItemDefaultCost(id)
      : Promise.resolve({ default_unit_cost: null, gst_percent: null }),
  ]);
  const s = stock.data;
  const onHand = Number(s?.on_hand ?? 0);

  return (
    <div>
      <InventoryHeader title={item.name} subtitle={item.sku ?? undefined} backHref="/inventory" actions={false} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {item.track_serials && <Badge>Serial tracked</Badge>}
        {!item.is_active && <Badge>Inactive</Badge>}
        {s?.is_out && <Badge variant="lost">Out of stock</Badge>}
        {s?.is_low && <Badge variant="warn">Low stock</Badge>}
        {ctx.access.canManageItems && (
          <div className="ml-auto flex gap-2">
            <Link
              href={`/inventory/items/${id}/edit`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 text-sm font-semibold hover:border-[var(--text-muted)]"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
            <DeleteItemButton
              itemId={id}
              itemName={item.name}
              isActive={item.is_active}
              hasHistory={history.length > 0 || serials.length > 0}
              redirectTo="/inventory"
            />
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="In stock" value={formatQty(onHand, item.unit_type)} color={onHand > 0 ? "success" : "error"} />
        {item.track_serials && <StatCard label="At customers" value={Number(s?.serials_dispatched ?? 0)} />}
        {item.track_serials && <StatCard label="Defective" value={Number(s?.serials_defective ?? 0)} color="warn" />}
        {ctx.access.canViewCost && (
          <StatCard
            label="Stock value"
            value={formatInr(value.data?.stock_value == null ? null : Number(value.data.stock_value))}
            sub={`Unit cost ${formatInr(value.data?.unit_cost == null ? cost?.default_unit_cost ?? null : Number(value.data.unit_cost))}`}
            color="primary"
          />
        )}
      </div>

      <ItemDetailTabs history={history} serials={serials} trackSerials={item.track_serials} unit={item.unit_type} />
    </div>
  );
}
