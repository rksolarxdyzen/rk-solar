import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { getInventoryAccess } from "@/lib/inventory/queries";
import { getMovementList } from "@/lib/inventory/movements";
import { formatDate } from "@/lib/inventory/format";
import { cn } from "@/lib/utils";
import { MOVEMENT_TYPE_LABELS, type InventoryMovementType } from "@/lib/inventory/types";

export const dynamic = "force-dynamic";

const FILTERS: { key: InventoryMovementType | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "inward", label: "Inward" },
  { key: "dispatch", label: "Dispatch" },
  { key: "return", label: "Return" },
  { key: "adjustment", label: "Adjustment" },
  { key: "reversal", label: "Reversal" },
];

function hrefFor(params: { type?: string; q?: string; page?: number }) {
  const sp = new URLSearchParams();
  if (params.type && params.type !== "all") sp.set("type", params.type);
  if (params.q) sp.set("q", params.q);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const s = sp.toString();
  return `/inventory/movements${s ? `?${s}` : ""}`;
}

const MATCH_LABEL: Record<string, string> = {
  serial: "Matched serial",
  item_spec: "Matched item name",
  movement_no: "Matched number",
  customer: "Matched customer",
  party: "Matched party",
};

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; page?: string }>;
}) {
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canView) redirect("/");

  const sp = await searchParams;
  const type = FILTERS.some((f) => f.key === sp.type && f.key !== "all") ? (sp.type as InventoryMovementType) : undefined;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const { rows, hasMore } = await getMovementList({ type, q, page });

  return (
    <div className="mx-auto max-w-5xl">
      <InventoryHeader title="Stock movements" subtitle="Inward, dispatch challans, returns and adjustments" backHref="/inventory" actions={false} />

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {FILTERS.map((f) => {
            const active = (type ?? "all") === f.key;
            return (
              <Link
                key={f.key}
                href={hrefFor({ type: f.key, q })}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold",
                  active ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--border)] bg-white text-[var(--text-body)]"
                )}
              >
                {f.label}
              </Link>
            );
          })}
        </div>
        <form method="get" className="flex gap-2">
          {type && <input type="hidden" name="type" value={type} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Customer, party, panel serial, item, or movement no"
            aria-label="Search by customer name, party name, panel serial, item name, or movement number"
            className="min-h-[40px] w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 text-sm sm:w-72"
          />
          <button type="submit" className="min-h-[40px] rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white">
            Find
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <Card className="py-10 text-center text-sm text-[var(--text-muted)]">
          {q ? `No movements match “${q}”.` : "No movements yet."}
        </Card>
      ) : (
        <Card className="divide-y divide-[var(--border-light)] p-0">
          {rows.map((m) => (
            <Link
              key={m.id}
              href={`/inventory/movements/${m.id}`}
              className={cn("flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--bg)]", m.reversed && "opacity-60")}
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm font-semibold">{m.movement_no}</span>
                  <Badge>{m.is_opening_stock ? "Opening stock" : MOVEMENT_TYPE_LABELS[m.movement_type]}</Badge>
                  {m.reversed && <Badge variant="lost">Reversed</Badge>}
                </span>
                <span className="block truncate text-sm text-[var(--text-muted)]">
                  {m.lead_id
                    ? m.customer_name ?? "Customer"
                    : m.party_id
                      ? m.party_name ?? "Party"
                      : m.supplier_name ?? "—"}
                  {q && m.match_reason && MATCH_LABEL[m.match_reason] ? ` · ${MATCH_LABEL[m.match_reason]}` : ""}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs text-[var(--text-muted)]">
                <span className="block">{formatDate(m.movement_date)}</span>
                <span className="block">
                  {m.line_count} item{m.line_count === 1 ? "" : "s"}
                  {m.serial_count > 0 && ` · ${m.serial_count} SN`}
                </span>
              </span>
            </Link>
          ))}
        </Card>
      )}

      {(page > 1 || hasMore) && (
        <div className="mt-3 flex justify-between">
          {page > 1 ? (
            <Link href={hrefFor({ type, q, page: page - 1 })} className="text-sm font-semibold text-[var(--primary)]">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={hrefFor({ type, q, page: page + 1 })} className="text-sm font-semibold text-[var(--primary)]">
              Older →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
