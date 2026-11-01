"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import {
  assignLeadDealer,
  getDealerCommission,
  listDealers,
  reviewDealerCommission,
  submitDealerCommission,
} from "@/actions/dealers";
import {
  COMMISSION_STATUS_LABELS,
  type CommissionStatus,
} from "@/lib/domain/dealers";
import { formatDateTime } from "@/lib/utils";

type DealerOption = { id: string; name: string; phone?: string | null };

type CommissionRow = {
  id: string;
  amount_inr: number | null;
  percent: number | null;
  notes: string | null;
  status: CommissionStatus | string;
  submitted_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
  dealer?: { id: string; name: string } | null;
  submitter?: { id: string; name: string } | null;
  reviewer?: { id: string; name: string } | null;
};

export function DealerCommissionPanel({
  leadId,
  dealerId,
  salesStage,
  forceOpen = false,
  canSubmit = false,
  canApprove = false,
  canAssign = false,
  onDone,
}: {
  leadId: string;
  dealerId: string | null | undefined;
  salesStage: string;
  /** Open the form after verify-and-complete when a dealer is linked */
  forceOpen?: boolean;
  canSubmit?: boolean;
  canApprove?: boolean;
  canAssign?: boolean;
  onDone?: () => void;
}) {
  const completed = salesStage === "completed";
  const show =
    canAssign ||
    (completed && Boolean(dealerId)) ||
    (completed && forceOpen) ||
    canSubmit;

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [dealers, setDealers] = useState<DealerOption[]>([]);
  const [selectedDealer, setSelectedDealer] = useState(dealerId ?? "");
  const [commission, setCommission] = useState<CommissionRow | null>(null);
  const [amount, setAmount] = useState("");
  const [percent, setPercent] = useState("");
  const [notes, setNotes] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSelectedDealer(dealerId ?? "");
  }, [dealerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [d, c] = await Promise.all([
          canAssign ? listDealers() : Promise.resolve([] as DealerOption[]),
          completed || forceOpen
            ? getDealerCommission(leadId)
            : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setDealers(d);
        setCommission(c as CommissionRow | null);
        if (c) {
          setAmount(c.amount_inr != null ? String(c.amount_inr) : "");
          setPercent(c.percent != null ? String(c.percent) : "");
          setNotes(c.notes ?? "");
        }
      } catch {
        /* schema may be missing — panel stays quiet */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId, completed, forceOpen, canAssign]);

  if (!show && !forceOpen) return null;

  const statusLabel = commission
    ? COMMISSION_STATUS_LABELS[commission.status as CommissionStatus] ??
      commission.status
    : null;
  const needsForm =
    completed &&
    Boolean(selectedDealer || dealerId) &&
    (!commission || commission.status === "rejected" || forceOpen);

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
      <div>
        <h3 className="font-semibold text-[var(--text-dark)]">Dealer commission</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Link a dealer and, after file completion, submit amount / % for Accounts
          approval
        </p>
      </div>

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {ok && <p className="text-sm text-[var(--success)]">{ok}</p>}

      {canAssign && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[12rem] flex-1">
            <Label htmlFor={`dealer-${leadId}`}>Dealer</Label>
            <Select
              id={`dealer-${leadId}`}
              value={selectedDealer}
              onChange={(e) => setSelectedDealer(e.target.value)}
            >
              <option value="">No dealer</option>
              {dealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  await assignLeadDealer({
                    leadId,
                    dealerId: selectedDealer || null,
                  });
                  setOk(selectedDealer ? "Dealer linked" : "Dealer cleared");
                  onDone?.();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed");
                }
              })
            }
          >
            Save dealer
          </Button>
        </div>
      )}

      {!canAssign && dealerId && commission?.dealer && (
        <p className="text-sm text-[var(--text-body)]">
          Dealer: <span className="font-medium">{commission.dealer.name}</span>
        </p>
      )}

      {loaded && commission && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-sm">
          <p className="font-medium">{statusLabel}</p>
          <p className="mt-1 text-[var(--text-body)]">
            {commission.amount_inr != null
              ? `₹${Number(commission.amount_inr).toLocaleString("en-IN")}`
              : "—"}
            {commission.percent != null ? ` · ${commission.percent}%` : ""}
          </p>
          {commission.notes && (
            <p className="mt-1 text-xs text-[var(--text-muted)]">{commission.notes}</p>
          )}
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Submitted {formatDateTime(commission.submitted_at)}
            {commission.submitter ? ` by ${commission.submitter.name}` : ""}
          </p>
          {commission.reviewed_at && (
            <p className="text-xs text-[var(--text-muted)]">
              Reviewed {formatDateTime(commission.reviewed_at)}
              {commission.reviewer ? ` by ${commission.reviewer.name}` : ""}
              {commission.review_notes ? ` — ${commission.review_notes}` : ""}
            </p>
          )}
        </div>
      )}

      {canSubmit && needsForm && (selectedDealer || dealerId) && (
        <div className="space-y-2 border-t border-[var(--border-light)] pt-3">
          <p className="text-sm font-semibold text-[var(--text-dark)]">
            {forceOpen ? "File completed — enter dealer commission" : "Commission form"}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Label htmlFor={`amt-${leadId}`}>Amount (₹)</Label>
              <Input
                id={`amt-${leadId}`}
                type="number"
                min={0}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Optional if % set"
              />
            </div>
            <div>
              <Label htmlFor={`pct-${leadId}`}>Percent (%)</Label>
              <Input
                id={`pct-${leadId}`}
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                placeholder="Optional if ₹ set"
              />
            </div>
          </div>
          <div>
            <Label htmlFor={`notes-${leadId}`}>Notes</Label>
            <Textarea
              id={`notes-${leadId}`}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  await submitDealerCommission({
                    leadId,
                    amountInr: amount.trim() ? Number(amount) : null,
                    percent: percent.trim() ? Number(percent) : null,
                    notes: notes || undefined,
                  });
                  setOk("Commission submitted for Accounts approval");
                  const c = await getDealerCommission(leadId);
                  setCommission(c as CommissionRow | null);
                  onDone?.();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed");
                }
              })
            }
          >
            Submit for approval
          </Button>
        </div>
      )}

      {canApprove && commission?.status === "pending" && (
        <div className="space-y-2 border-t border-[var(--border-light)] pt-3">
          <Label htmlFor={`rev-${leadId}`}>Review notes</Label>
          <Input
            id={`rev-${leadId}`}
            value={reviewNotes}
            onChange={(e) => setReviewNotes(e.target.value)}
            placeholder="Optional"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    await reviewDealerCommission({
                      leadId,
                      decision: "approved",
                      reviewNotes: reviewNotes || undefined,
                    });
                    setOk("Commission approved");
                    const c = await getDealerCommission(leadId);
                    setCommission(c as CommissionRow | null);
                    onDone?.();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed");
                  }
                })
              }
            >
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    await reviewDealerCommission({
                      leadId,
                      decision: "rejected",
                      reviewNotes: reviewNotes || undefined,
                    });
                    setOk("Commission rejected");
                    const c = await getDealerCommission(leadId);
                    setCommission(c as CommissionRow | null);
                    onDone?.();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed");
                  }
                })
              }
            >
              Reject
            </Button>
          </div>
        </div>
      )}

      {completed && !dealerId && !selectedDealer && canAssign && (
        <p className="text-xs text-[var(--text-muted)]">
          Assign a dealer to unlock the commission form on this completed file.
        </p>
      )}
    </div>
  );
}
