import Link from "next/link";
import { redirect } from "next/navigation";
import { ScanLine } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { createClient } from "@/lib/supabase/server";
import { customerNames, getInventoryAccess } from "@/lib/inventory/queries";
import { normalizeSerial, parseScan } from "@/lib/inventory/serial-parse";
import { formatDate } from "@/lib/inventory/format";
import {
  MOVEMENT_TYPE_LABELS,
  SERIAL_STATUS_LABELS,
  type InventoryMovementType,
  type ReturnCondition,
  type SerialStatus,
} from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

type SerialHit = {
  id: string;
  serial_no: string;
  status: SerialStatus;
  current_lead_id: string | null;
  raw_scan: string | null;
  item: { id: string; name: string } | null;
};

type TimelineRow = {
  line: {
    return_condition: ReturnCondition | null;
    movement: {
      id: string;
      movement_no: string;
      movement_type: InventoryMovementType;
      movement_date: string;
      created_at: string;
      lead_id: string | null;
      supplier_name: string | null;
      is_opening_stock: boolean;
      reversed_by_id: string | null;
      by: { name: string } | null;
    };
  };
};

const SELECT = "id,serial_no,status,current_lead_id,raw_scan,item:inventory_items(id,name)";

export default async function SerialLookupPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canView) redirect("/");

  const { q } = await searchParams;
  const raw = (q ?? "").trim();
  const needle = normalizeSerial(raw);
  const extracted = raw ? parseScan(raw, "extract").serial : null;
  const candidates = [...new Set([needle, extracted].filter((v): v is string => Boolean(v)))];
  const supabase = await createClient();

  let hits: SerialHit[] = [];
  let timeline: TimelineRow[] = [];
  let names = new Map<string, string>();
  if (needle) {
    const exact = await supabase.from("inventory_serials").select(SELECT).in("serial_no", candidates).limit(2);
    hits = (exact.data ?? []) as unknown as SerialHit[];
    if (hits.length === 0) {
      const byLabel = await supabase.from("inventory_serials").select(SELECT).eq("raw_scan", raw).limit(2);
      hits = (byLabel.data ?? []) as unknown as SerialHit[];
    }
    const partialNeedle = extracted ?? needle;
    if (hits.length === 0 && partialNeedle.length >= 4) {
      const partial = await supabase
        .from("inventory_serials")
        .select(SELECT)
        .ilike("serial_no", `%${partialNeedle}%`)
        .order("serial_no")
        .limit(25);
      hits = (partial.data ?? []) as unknown as SerialHit[];
    }
    if (hits.length === 1) {
      const { data } = await supabase
        .from("inventory_movement_line_serials")
        .select(
          "line:inventory_movement_lines!inner(return_condition,movement:inventory_movements!inner(id,movement_no,movement_type,movement_date,created_at,lead_id,supplier_name,is_opening_stock,reversed_by_id,by:profiles!inventory_movements_created_by_fkey(name)))"
        )
        .eq("serial_id", hits[0].id);
      timeline = ((data ?? []) as unknown as TimelineRow[]).sort((a, b) =>
        a.line.movement.created_at.localeCompare(b.line.movement.created_at)
      );
      names = await customerNames(supabase, [hits[0].current_lead_id, ...timeline.map((t) => t.line.movement.lead_id)]);
    }
  }

  const single = hits.length === 1 ? hits[0] : null;

  return (
    <div className="mx-auto max-w-3xl">
      <InventoryHeader title="Find a serial" subtitle="Scan or type a panel / inverter serial number" backHref="/inventory" actions={false} />

      <form method="get" className="mb-4 flex gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-xl border-2 border-[var(--border)] bg-white px-3 focus-within:border-[var(--primary)]">
          <ScanLine className="h-5 w-5 text-[var(--text-muted)]" />
          <input
            name="q"
            defaultValue={q ?? ""}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="Serial number"
            aria-label="Serial number"
            className="min-h-[48px] min-w-0 flex-1 bg-transparent font-mono text-base outline-none"
          />
        </div>
        <button type="submit" className="min-h-[48px] rounded-lg bg-[var(--primary)] px-5 text-sm font-semibold text-white">
          Find
        </button>
      </form>

      {needle && hits.length === 0 && (
        <Card className="py-8 text-center text-sm text-[var(--text-muted)]">No serial matches “{extracted ?? needle}”.</Card>
      )}

      {hits.length > 1 && (
        <Card className="divide-y divide-[var(--border-light)] p-0">
          {hits.map((h) => (
            <Link key={h.id} href={`/inventory/serials?q=${encodeURIComponent(h.serial_no)}`} className="flex items-center justify-between gap-2 px-4 py-3 hover:bg-[var(--bg)]">
              <span className="font-mono font-semibold">{h.serial_no}</span>
              <span className="text-sm text-[var(--text-muted)]">{h.item?.name}</span>
            </Link>
          ))}
        </Card>
      )}

      {single && (
        <div className="space-y-3" data-testid="serial-result">
          <Card className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="break-all font-mono text-lg font-bold">{single.serial_no}</span>
              <Badge variant={single.status === "in_stock" ? "received" : single.status === "dispatched" ? "contacted" : "warn"}>
                {SERIAL_STATUS_LABELS[single.status]}
              </Badge>
            </div>
            {single.item && (
              <p className="text-sm">
                Item:{" "}
                <Link href={`/inventory/items/${single.item.id}`} className="font-medium text-[var(--primary)] hover:underline">
                  {single.item.name}
                </Link>
              </p>
            )}
            {single.current_lead_id && (
              <p className="text-sm">
                At customer:{" "}
                <Link href={`/leads/${single.current_lead_id}`} className="font-medium text-[var(--primary)] hover:underline">
                  {names.get(single.current_lead_id) ?? "Customer"}
                </Link>
              </p>
            )}
            {single.raw_scan && <p className="break-all text-xs text-[var(--text-muted)]">Label: {single.raw_scan}</p>}
            <Link
              href={`/inventory/movements?q=${encodeURIComponent(single.serial_no)}`}
              className="inline-flex min-h-[40px] items-center text-sm font-semibold text-[var(--primary)] hover:underline"
            >
              Find in movements →
            </Link>
          </Card>

          <Card className="space-y-3">
            <h2 className="font-semibold">Timeline</h2>
            <ol className="space-y-3 border-l-2 border-[var(--border)] pl-4" data-testid="serial-timeline">
              {timeline.map(({ line: { movement: m, return_condition } }) => (
                <li key={m.id} className={m.reversed_by_id ? "opacity-60" : undefined}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge>{MOVEMENT_TYPE_LABELS[m.movement_type]}</Badge>
                    <Link href={`/inventory/movements/${m.id}`} className="font-mono text-xs font-semibold text-[var(--primary)] hover:underline">
                      {m.movement_no}
                    </Link>
                    {return_condition === "defective" && <Badge variant="warn">Defective</Badge>}
                    {m.reversed_by_id && <Badge variant="lost">Reversed</Badge>}
                  </div>
                  <p className="text-sm text-[var(--text-muted)]">
                    {formatDate(m.movement_date)} ·{" "}
                    {m.lead_id ? names.get(m.lead_id) ?? "Customer" : m.is_opening_stock ? "Opening stock" : m.supplier_name ?? "—"}
                    {m.by?.name ? ` · by ${m.by.name}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      )}
    </div>
  );
}
