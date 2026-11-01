"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { formatQty } from "@/lib/inventory/format";
import type { PickerItem } from "@/lib/inventory/queries";

export function ItemPicker({
  open,
  onClose,
  items,
  excludeIds = [],
  onPick,
  showStock = true,
  qtyPrefix,
}: {
  open: boolean;
  onClose: () => void;
  items: PickerItem[];
  excludeIds?: string[];
  onPick: (item: PickerItem) => void;
  showStock?: boolean;
  qtyPrefix?: string;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter(
      (i) =>
        !excludeIds.includes(i.id) &&
        (!needle || [i.name, i.sku, i.category_name].some((v) => v?.toLowerCase().includes(needle)))
    );
  }, [items, q, excludeIds]);

  return (
    <Modal open={open} onClose={onClose} title="Add item" subtitle="Search by name, SKU or category">
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} className="min-h-[44px] pl-9" placeholder="Search items…" />
        </div>
        <ul className="max-h-[55vh] divide-y divide-[var(--border-light)] overflow-y-auto rounded-lg border border-[var(--border)]">
          {list.length === 0 && <li className="p-4 text-center text-sm text-[var(--text-muted)]">No items found.</li>}
          {list.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(i);
                  setQ("");
                  onClose();
                }}
                className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--bg)]"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-[var(--text-dark)]">{i.name}</span>
                  <span className="block truncate text-xs text-[var(--text-muted)]">
                    {[i.category_name, i.sku].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {i.track_serials && <Badge>Serial</Badge>}
                  {showStock && (
                    <span className="text-xs font-semibold tabular-nums">
                      {qtyPrefix && <span className="font-normal text-[var(--text-muted)]">{qtyPrefix} </span>}
                      {formatQty(i.on_hand, i.unit_type)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
