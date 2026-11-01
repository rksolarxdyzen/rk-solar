import Link from "next/link";
import { AlertTriangle, Warehouse } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { formatQty } from "@/lib/inventory/format";
import type { InventoryUnit } from "@/lib/inventory/types";

const SHOW = 8;

type Row = {
  item_id: string;
  name: string;
  unit_type: InventoryUnit;
  on_hand: number;
  low_stock_threshold: number;
  is_out: boolean;
  is_low: boolean;
};

export async function LowStockCard() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_stock_on_hand")
    .select("item_id,name,unit_type,on_hand,low_stock_threshold,is_out,is_low")
    .eq("is_active", true)
    .or("is_out.eq.true,is_low.eq.true")
    .order("on_hand", { ascending: true })
    .order("name")
    .limit(200);
  const rows = (data ?? []) as Row[];
  const outCount = rows.filter((r) => r.is_out).length;
  const lowCount = rows.length - outCount;

  return (
    <section className="mb-6 rounded-xl border border-[var(--border)] bg-white p-5" data-testid="low-stock-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[var(--text-muted)]">
          <Warehouse className="h-4 w-4" /> Stock alerts
        </h2>
        <Link href="/inventory" className="text-sm font-semibold text-[var(--primary)] hover:underline">
          Open inventory
        </Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">All items are above their low-stock level.</p>
      ) : (
        <>
          <p className="mb-2 flex items-center gap-1.5 text-sm text-[var(--text-body)]">
            <AlertTriangle className="h-4 w-4 text-[var(--warn)]" />
            {outCount > 0 && `${outCount} out of stock`}
            {outCount > 0 && lowCount > 0 && " · "}
            {lowCount > 0 && `${lowCount} running low`}
          </p>
          <ul className="divide-y divide-[var(--border-light)]">
            {rows.slice(0, SHOW).map((r) => (
              <li key={r.item_id}>
                <Link href={`/inventory/items/${r.item_id}`} className="flex min-h-[44px] items-center justify-between gap-3 py-2 hover:text-[var(--primary)]">
                  <span className="min-w-0 truncate text-sm font-medium">{r.name}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums">
                    {formatQty(Number(r.on_hand), r.unit_type)}
                    <Badge variant={r.is_out ? "lost" : "warn"}>{r.is_out ? "Out" : "Low"}</Badge>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {rows.length > SHOW && (
            <Link href="/inventory" className="mt-2 inline-block text-xs font-semibold text-[var(--primary)]">
              +{rows.length - SHOW} more
            </Link>
          )}
        </>
      )}
    </section>
  );
}
