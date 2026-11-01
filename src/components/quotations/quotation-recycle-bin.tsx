"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  purgeQuotation,
  restoreQuotation,
  type DeletedQuotationRow,
} from "@/lib/quotations/actions/quotation";
import { formatCurrency, formatDateTime } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  rejected: "Rejected",
  accepted: "Accepted",
};

type PendingAction = { kind: "restore" | "purge"; row: DeletedQuotationRow };

export function QuotationRecycleBin({
  rows,
  canRestore,
  canPurge,
}: {
  rows: DeletedQuotationRow[];
  canRestore: boolean;
  canPurge: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<PendingAction | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.quotation_no, r.customer_name, r.customer_phone, r.lead_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [rows, query]);

  function close() {
    setAction(null);
    setConfirmText("");
    setError(null);
  }

  function run() {
    if (!action) return;
    setError(null);
    const { kind, row } = action;
    startTransition(async () => {
      const res =
        kind === "restore"
          ? await restoreQuotation(row.id)
          : await purgeQuotation(row.id, {
              quotationNo: row.quotation_no,
              customerName: row.customer_name,
            });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const note = "note" in res ? res.note : undefined;
      setNotice(
        kind === "restore"
          ? `${row.quotation_no} restored.${note ? ` ${note}` : ""}`
          : `${row.quotation_no} deleted permanently.`
      );
      close();
      router.refresh();
    });
  }

  const purgeConfirmed =
    action?.kind !== "purge" || confirmText.trim() === action.row.quotation_no;

  return (
    <div className="space-y-4">
      {notice && (
        <p className="rounded-lg border border-[var(--success)] bg-[var(--success-light)] px-3 py-2 text-sm text-[var(--text-dark)]">
          {notice}
        </p>
      )}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search quote no., customer, phone"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border)] bg-white/70 px-6 py-12 text-center">
          <Trash2 className="mx-auto h-8 w-8 text-[var(--text-muted)]" />
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            {rows.length === 0 ? "The Recycle bin is empty." : "No deleted quotations match."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-semibold text-[var(--text-dark)]">
                  {row.quotation_no}
                  <span className="ml-2 rounded-full bg-[var(--bg)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {STATUS_LABELS[row.status] ?? row.status}
                  </span>
                </p>
                <p className="text-sm text-[var(--text-body)]">
                  {row.lead_name ?? row.customer_name}
                  {row.customer_phone ? ` · ${row.customer_phone}` : ""} ·{" "}
                  <strong>{formatCurrency(row.grand_total)}</strong>
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Deleted {formatDateTime(row.deleted_at)}
                  {row.deleted_by_name ? ` by ${row.deleted_by_name}` : ""}
                </p>
                {row.delete_reason && (
                  <p className="text-xs text-[var(--text-body)]">Reason: {row.delete_reason}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {canRestore && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => setAction({ kind: "restore", row })}
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restore
                  </Button>
                )}
                {canPurge && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={pending}
                    onClick={() => setAction({ kind: "purge", row })}
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete forever
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={action != null}
        onClose={close}
        title={action?.kind === "purge" ? "Delete permanently?" : "Restore quotation?"}
        subtitle={action ? `${action.row.quotation_no} · ${action.row.customer_name}` : undefined}
      >
        {action && (
          <div className="space-y-4">
            {action.kind === "restore" ? (
              <p className="text-sm text-[var(--text-body)]">
                The quotation comes back to the Quotes list with the same number, items and
                totals.
              </p>
            ) : (
              <>
                <p className="text-sm text-[var(--text-body)]">
                  This removes the quotation and its line items for good. It cannot be restored
                  afterwards. Type <strong>{action.row.quotation_no}</strong> to confirm.
                </p>
                <Input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder={action.row.quotation_no}
                />
              </>
            )}
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
                variant={action.kind === "purge" ? "danger" : "primary"}
                onClick={run}
                disabled={pending || !purgeConfirmed}
              >
                {action.kind === "purge" ? (
                  <>
                    <Trash2 className="h-4 w-4" />
                    {pending ? "Deleting…" : "Delete forever"}
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    {pending ? "Restoring…" : "Restore"}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
