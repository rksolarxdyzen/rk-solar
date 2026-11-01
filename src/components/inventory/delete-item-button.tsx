"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { deleteInventoryItem, setInventoryItemActive } from "@/actions/inventory";
import { cn } from "@/lib/utils";

export function DeleteItemButton({
  itemId,
  itemName,
  isActive,
  hasHistory = false,
  compact = false,
  redirectTo,
}: {
  itemId: string;
  itemName: string;
  isActive: boolean;
  /** Known up front on the item page; the list finds out when Delete is refused. */
  hasHistory?: boolean;
  compact?: boolean;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const locked = hasHistory || blocked !== null;

  function close() {
    setOpen(false);
    setError(null);
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const res = await deleteInventoryItem(itemId);
      if (!res.ok) {
        if ("hasHistory" in res) return setBlocked(res.error);
        return setError(res.error);
      }
      close();
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    });
  }

  function toggleActive() {
    setError(null);
    startTransition(async () => {
      const res = await setInventoryItemActive(itemId, !isActive);
      if (!res.ok) return setError(res.error);
      close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Delete ${itemName}`}
        title="Delete"
        className={cn(
          "inline-flex items-center justify-center gap-1.5 rounded-lg border-[1.5px] border-[var(--border)] bg-white text-sm font-semibold text-[var(--error)] hover:border-[var(--error)]",
          compact ? "h-9 w-9" : "min-h-[40px] px-3"
        )}
      >
        <Trash2 className="h-4 w-4" />
        {!compact && "Delete"}
      </button>
      <Modal
        open={open}
        onClose={close}
        title={locked ? `${itemName} can't be deleted` : `Delete ${itemName}?`}
        subtitle={
          locked
            ? "It has live stock entries (inward, dispatch or returns). Deleting it would break challans and history. Mark inactive to hide it from new stock moves."
            : "This permanently removes the item from the catalog. Only unused items (or ones whose movements were fully reversed) can be deleted."
        }
      >
        <div className="space-y-3">
          {locked && (
            <p className="text-sm text-[var(--text-body)]">
              {isActive
                ? "Mark it inactive instead: it disappears from inward and dispatch, but its history, serials and challans stay."
                : "It is already inactive, so it is hidden from inward and dispatch. You can make it active again."}
            </p>
          )}
          {error && <p className="text-sm font-medium text-[var(--error)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            {locked ? (
              <Button type="button" onClick={toggleActive} disabled={pending}>
                {pending ? "Saving…" : isActive ? "Mark inactive" : "Make active"}
              </Button>
            ) : (
              <Button type="button" variant="danger" onClick={remove} disabled={pending}>
                <Trash2 className="h-4 w-4" /> {pending ? "Deleting…" : "Delete item"}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
