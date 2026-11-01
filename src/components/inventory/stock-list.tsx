"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Pencil, Search, ScanLine } from "lucide-react";
import { DeleteItemButton } from "@/components/inventory/delete-item-button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatInr, formatQty, inventorySearchMatches } from "@/lib/inventory/format";
import type { StockListRow } from "@/lib/inventory/queries";

type Filter = "all" | "low" | "out";

function StockBadge({ row }: { row: StockListRow }) {
  if (row.is_out) return <Badge variant="lost">Out</Badge>;
  if (row.is_low) return <Badge variant="warn">Low</Badge>;
  return null;
}

function ItemActions({ row, labeled = false }: { row: StockListRow; labeled?: boolean }) {
  return (
    <>
      <Link
        href={`/inventory/items/${row.item_id}/edit`}
        aria-label={`Edit ${row.name}`}
        title="Edit"
        className={
          labeled
            ? "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-2.5 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)]"
            : "inline-flex h-9 w-9 items-center justify-center rounded-lg border-[1.5px] border-[var(--border)] bg-white text-[var(--text-body)] hover:border-[var(--text-muted)]"
        }
      >
        <Pencil className="h-4 w-4" />
        {labeled && <span>Edit</span>}
      </Link>
      <DeleteItemButton itemId={row.item_id} itemName={row.name} isActive={row.is_active} compact={!labeled} />
    </>
  );
}

export function StockList({ rows, showValue, canManage = false }: { rows: StockListRow[]; showValue: boolean; canManage?: boolean }) {
  const [query, setQuery] = useState("");
  const [masterGroup, setMasterGroup] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [subcategory, setSubcategory] = useState<string>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [showInactive, setShowInactive] = useState(false);

  const masterGroups = useMemo(
    () => [...new Set(rows.map((r) => r.master_group_name).filter((c): c is string => Boolean(c)))].sort(),
    [rows]
  );
  const categories = useMemo(() => {
    const filtered = rows.filter((r) => masterGroup === "all" || r.master_group_name === masterGroup);
    return [...new Set(filtered.map((r) => r.category_name).filter((c): c is string => Boolean(c)))].sort();
  }, [rows, masterGroup]);
  const subcategories = useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        (masterGroup === "all" || r.master_group_name === masterGroup) &&
        (category === "all" || r.category_name === category)
    );
    return [...new Set(filtered.map((r) => r.subcategory_name).filter((c): c is string => Boolean(c)))].sort();
  }, [rows, masterGroup, category]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (!showInactive && !r.is_active) return false;
      if (masterGroup !== "all" && r.master_group_name !== masterGroup) return false;
      if (category !== "all" && r.category_name !== category) return false;
      if (subcategory !== "all" && r.subcategory_name !== subcategory) return false;
      if (filter === "low" && !r.is_low) return false;
      if (filter === "out" && !r.is_out) return false;
      if (!q) return true;
      return inventorySearchMatches(
        [r.name, r.sku, r.master_group_name, r.brand_name, r.category_name, r.subcategory_name],
        q
      );
    });
  }, [rows, query, masterGroup, category, subcategory, filter, showInactive]);

  const chip = (active: boolean) =>
    cn(
      "min-h-[36px] shrink-0 rounded-full border px-3 text-xs font-semibold transition",
      active
        ? "border-[var(--primary)] bg-[var(--primary-faint)] text-[var(--primary)]"
        : "border-[var(--border)] bg-white text-[var(--text-muted)] hover:text-[var(--text-body)]"
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            className="min-h-[44px] pl-9"
            placeholder="Search hierarchy, item, SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Link
          href="/inventory/serials"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)]"
        >
          <ScanLine className="h-4 w-4" /> Find a serial
        </Link>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
        <button
          type="button"
          className={chip(masterGroup === "all" && category === "all" && subcategory === "all")}
          onClick={() => {
            setMasterGroup("all");
            setCategory("all");
            setSubcategory("all");
          }}
        >
          All
        </button>
        {masterGroups.map((g) => (
          <button
            key={`mg-${g}`}
            type="button"
            className={chip(masterGroup === g)}
            onClick={() => {
              setMasterGroup(masterGroup === g ? "all" : g);
              setCategory("all");
              setSubcategory("all");
            }}
          >
            {g}
          </button>
        ))}
        {categories.map((c) => (
          <button
            key={`cat-${c}`}
            type="button"
            className={chip(category === c)}
            onClick={() => {
              setCategory(category === c ? "all" : c);
              setSubcategory("all");
            }}
          >
            {c}
          </button>
        ))}
        {subcategories.map((s) => (
          <button
            key={`sub-${s}`}
            type="button"
            className={chip(subcategory === s)}
            onClick={() => setSubcategory(subcategory === s ? "all" : s)}
          >
            {s}
          </button>
        ))}
        <span className="mx-1 w-px shrink-0 bg-[var(--border)]" />
        <button type="button" className={chip(filter === "low")} onClick={() => setFilter(filter === "low" ? "all" : "low")}>
          Low stock
        </button>
        <button type="button" className={chip(filter === "out")} onClick={() => setFilter(filter === "out" ? "all" : "out")}>
          Out of stock
        </button>
        <button type="button" className={chip(showInactive)} onClick={() => setShowInactive((v) => !v)}>
          Show inactive
        </button>
      </div>

      {visible.length === 0 ? (
        <Card className="py-10 text-center text-sm text-[var(--text-muted)]">
          {rows.length === 0 ? "No inventory items yet." : "No items match these filters."}
        </Card>
      ) : (
        <>
          <div className="space-y-2 md:hidden">
            {visible.map((r) => (
              <Card key={r.item_id} hover className={cn("p-0", !r.is_active && "opacity-60")}>
                <Link href={`/inventory/items/${r.item_id}`} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[var(--text-dark)]">{r.name}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {[r.master_group_name, r.brand_name, r.category_name, r.subcategory_name, r.sku]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    {r.track_serials && r.serials_dispatched > 0 && (
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">{r.serials_dispatched} at customers</p>
                    )}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-bold tabular-nums text-[var(--text-dark)]">{formatQty(r.on_hand, r.unit_type)}</p>
                    <div className="flex justify-end gap-1">
                      <StockBadge row={r} />
                      {r.track_serials && <Badge>Serial</Badge>}
                    </div>
                    {showValue && <p className="text-xs text-[var(--text-muted)]">{formatInr(r.stock_value)}</p>}
                  </div>
                </Link>
                {canManage && (
                  <div className="flex justify-end gap-2 border-t border-[var(--border-light)] px-4 py-2">
                    <ItemActions row={r} labeled />
                  </div>
                )}
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-x-auto p-0 md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-left text-[0.68rem] uppercase tracking-wider text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Hierarchy</th>
                  <th className="px-4 py-3 text-right">In stock</th>
                  <th className="px-4 py-3 text-right">At customers</th>
                  {showValue && <th className="px-4 py-3 text-right">Stock value</th>}
                  {canManage && <th className="px-4 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.item_id} className={cn("border-b border-[var(--border-light)] last:border-0 hover:bg-[var(--bg)]", !r.is_active && "opacity-60")}>
                    <td className="px-4 py-3">
                      <Link href={`/inventory/items/${r.item_id}`} className="font-semibold text-[var(--text-dark)] hover:text-[var(--primary)]">
                        {r.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">
                        {r.sku && <span className="text-xs text-[var(--text-muted)]">{r.sku}</span>}
                        {r.track_serials && <Badge>Serial</Badge>}
                        {!r.is_active && <Badge>Inactive</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-body)]">
                      {[r.master_group_name, r.brand_name, r.category_name, r.subcategory_name]
                        .filter(Boolean)
                        .join(" › ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="font-semibold tabular-nums">{formatQty(r.on_hand, r.unit_type)}</span>{" "}
                      <StockBadge row={r} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--text-body)]">
                      {r.track_serials ? r.serials_dispatched : "—"}
                    </td>
                    {showValue && (
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatInr(r.stock_value)}
                        {r.missing_cost_count > 0 && (
                          <span className="block text-[0.65rem] text-[var(--warn)]">
                            {r.track_serials ? `${r.missing_cost_count} without cost` : "no cost set"}
                          </span>
                        )}
                      </td>
                    )}
                    {canManage && (
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <ItemActions row={r} labeled />
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
