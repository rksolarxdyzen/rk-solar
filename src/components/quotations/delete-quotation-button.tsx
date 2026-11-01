"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { deleteQuotation } from "@/lib/quotations/actions/quotation";
import { cn } from "@/lib/utils";

export function DeleteQuotationButton({
  quoteId,
  quotationNo,
  customerName,
  blockers,
  variant = "icon",
  redirectTo,
}: {
  quoteId: string;
  quotationNo: string;
  customerName: string;
  blockers: string[];
  variant?: "icon" | "button";
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [serverReasons, setServerReasons] = useState<string[] | null>(null);
  const [deleteReason, setDeleteReason] = useState("");

  const reasons = serverReasons ?? blockers;
  const blocked = reasons.length > 0;

  function close() {
    setOpen(false);
    setError(null);
    setServerReasons(null);
    setDeleteReason("");
  }

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const res = await deleteQuotation(quoteId, deleteReason);
      if (res.ok) {
        close();
        if (redirectTo) router.push(redirectTo);
        router.refresh();
        return;
      }
      if (res.reasons?.length) setServerReasons(res.reasons);
      else setError(res.error);
    });
  }

  const Icon = blockers.length > 0 ? Lock : Trash2;

  return (
    <>
      {variant === "icon" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={blockers[0] ? `Cannot delete: ${blockers[0]}` : "Delete quotation"}
          aria-label={`Delete quotation ${quotationNo}`}
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent transition",
            blockers.length > 0
              ? "text-[var(--text-muted)] hover:border-[var(--border)]"
              : "text-[var(--error)] hover:border-red-200 hover:bg-[var(--error-light)]"
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      ) : (
        <Button
          size="sm"
          variant={blockers.length > 0 ? "secondary" : "danger"}
          onClick={() => setOpen(true)}
          title={blockers[0] ? `Cannot delete: ${blockers[0]}` : undefined}
        >
          <Icon className="h-4 w-4" />
          Delete
        </Button>
      )}

      <Modal
        open={open}
        onClose={close}
        title={blocked ? "Cannot delete this quotation" : "Move to Recycle bin?"}
        subtitle={`${quotationNo} · ${customerName}`}
      >
        {blocked ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--text-body)]">
              This quotation is locked because:
            </p>
            <ul className="space-y-1.5">
              {reasons.map((reason) => (
                <li
                  key={reason}
                  className="flex gap-2 rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]"
                >
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {reason}
                </li>
              ))}
            </ul>
            <div className="flex justify-end">
              <Button size="sm" variant="secondary" onClick={close}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-body)]">
              Quotation <strong>{quotationNo}</strong> for <strong>{customerName}</strong> will
              be moved to the Recycle bin. Authorised users can restore it from there.
            </p>
            <div>
              <label
                htmlFor={`delete-reason-${quoteId}`}
                className="mb-1 block text-xs font-semibold text-[var(--text-muted)]"
              >
                Reason (optional)
              </label>
              <textarea
                id={`delete-reason-${quoteId}`}
                rows={2}
                maxLength={300}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Duplicate quote, customer asked for revision"
                className="w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm"
              />
            </div>
            {error && (
              <p className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={close} disabled={pending}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={confirmDelete}
                disabled={pending}
              >
                <Trash2 className="h-4 w-4" />
                {pending ? "Moving…" : "Move to bin"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
