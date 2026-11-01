"use client";

import { useState, useTransition } from "react";
import { PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  correctPayment,
  correctWonPaymentPlan,
  setSettlementDiscount,
} from "@/actions/payments";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PAYMENT_MILESTONE_LABELS,
  type PaymentMethod,
  type PaymentMilestone,
  type PaymentRow,
} from "@/lib/domain/payments";
import { formatCurrency } from "@/lib/utils";

const selectClass =
  "w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm";

type CorrectablePayment = Pick<
  PaymentRow,
  "id" | "milestone" | "amount" | "method" | "transaction_id" | "paid_at"
>;

export function CorrectPaymentButton({
  payment,
  onSaved,
}: {
  payment: CorrectablePayment;
  onSaved: (updated: {
    amount: number;
    method: PaymentMethod;
    transactionId: string;
    paidAt: string;
  }) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState<PaymentMethod>(payment.method as PaymentMethod);
  const [transactionId, setTransactionId] = useState(payment.transaction_id ?? "");
  const [paidAt, setPaidAt] = useState((payment.paid_at ?? "").slice(0, 10));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setAmount(String(payment.amount));
    setMethod(payment.method as PaymentMethod);
    setTransactionId(payment.transaction_id ?? "");
    setPaidAt((payment.paid_at ?? "").slice(0, 10));
    setReason("");
    setError(null);
  }

  const milestone = PAYMENT_MILESTONE_LABELS[payment.milestone as PaymentMilestone];

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <PencilLine className="h-3.5 w-3.5" />
        Correct
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Correct ${milestone} payment`}
        subtitle={`Recorded: ${formatCurrency(Number(payment.amount))}`}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const res = await correctPayment({
                paymentId: payment.id,
                amount: Number(amount),
                method,
                transactionId,
                paidAt,
                reason,
              });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setOpen(false);
              await onSaved({ amount: Number(amount), method, transactionId, paidAt });
            });
          }}
        >
          <p className="text-xs text-[var(--text-muted)]">
            Accounts correction: the quotation total check is skipped. Verification status stays
            as it is, and the change is saved in the audit log.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Correct amount (₹)</Label>
              <Input
                type="number"
                min={1}
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Method</Label>
              <select
                className={selectClass}
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Transaction ID</Label>
              <Input
                required
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
              />
            </div>
            <div>
              <Label>Paid on</Label>
              <Input
                type="date"
                required
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Reason for correction</Label>
              <Textarea
                rows={2}
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Sales entered full project amount instead of token"
              />
            </div>
          </div>
          {error && (
            <p className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save correction"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function SettlementDiscountSummary({
  leadId,
  amount,
  reason,
  remainingBeforeDiscount,
  canEdit,
  onSaved,
}: {
  leadId: string;
  amount: number;
  reason: string | null;
  /** Project total minus recorded payments, ignoring the current discount. */
  remainingBeforeDiscount: number | null;
  canEdit: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(String(amount));
  const [draftReason, setDraftReason] = useState(reason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (amount <= 0 && !canEdit) return null;

  const suggested =
    remainingBeforeDiscount != null && remainingBeforeDiscount > 0 ? remainingBeforeDiscount : null;

  return (
    <div className="rounded-lg border border-[var(--border-light)] px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-dark)]">Settlement discount:</span>{" "}
          {amount > 0 ? (
            <>
              {formatCurrency(amount)}
              {reason ? ` · ${reason}` : ""}
            </>
          ) : (
            "None"
          )}
        </p>
        {canEdit && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setDraft(String(amount > 0 ? amount : suggested ?? ""));
              setDraftReason(reason ?? "");
              setError(null);
              setOpen(true);
            }}
          >
            <PencilLine className="h-3.5 w-3.5" />
            {amount > 0 ? "Edit discount" : "Apply discount"}
          </Button>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Settlement discount"
        subtitle={
          suggested != null
            ? `Balance before discount: ${formatCurrency(suggested)}`
            : "Amount waived for this customer"
        }
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const res = await setSettlementDiscount({
                leadId,
                amount: Number(draft) || 0,
                reason: draftReason,
              });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setOpen(false);
              await onSaved();
            });
          }}
        >
          <p className="text-xs text-[var(--text-muted)]">
            Use when the customer was given a discount after the total was fixed (e.g. total
            ₹1,85,000, received ₹1,84,000 after a ₹1,000 discount). The discount comes off the
            pending balance: Final first, then Pre-dispatch, then Token. Enter 0 to remove it.
          </p>
          <div>
            <Label>Discount (₹)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              required
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <div>
            <Label>Reason</Label>
            <Textarea
              rows={2}
              value={draftReason}
              onChange={(e) => setDraftReason(e.target.value)}
              placeholder="e.g. ₹1,000 discount approved at final settlement"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save discount"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export function WonPlanSummary({
  leadId,
  tokenAmount,
  preDispatchAmount,
  finalAmount,
  canCorrect,
  onSaved,
}: {
  leadId: string;
  tokenAmount: number;
  preDispatchAmount: number;
  finalAmount: number;
  canCorrect: boolean;
  onSaved: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState(String(tokenAmount));
  const [pre, setPre] = useState(String(preDispatchAmount));
  const [final, setFinal] = useState(String(finalAmount));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = tokenAmount + preDispatchAmount + finalAmount;
  const draftTotal = (Number(token) || 0) + (Number(pre) || 0) + (Number(final) || 0);

  if (total <= 0 && !canCorrect) return null;

  return (
    <div className="rounded-lg border border-[var(--border-light)] px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-dark)]">Won payment plan:</span> Token{" "}
          {formatCurrency(tokenAmount)} · Pre-dispatch {formatCurrency(preDispatchAmount)} · Final{" "}
          {formatCurrency(finalAmount)}
        </p>
        {canCorrect && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setToken(String(tokenAmount));
              setPre(String(preDispatchAmount));
              setFinal(String(finalAmount));
              setReason("");
              setError(null);
              setOpen(true);
            }}
          >
            <PencilLine className="h-3.5 w-3.5" />
            Correct plan
          </Button>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Correct Won payment plan"
        subtitle={`Current total: ${formatCurrency(total)}`}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const res = await correctWonPaymentPlan({
                leadId,
                tokenAmount: Number(token) || 0,
                preDispatchAmount: Number(pre) || 0,
                finalAmount: Number(final) || 0,
                reason,
              });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setOpen(false);
              await onSaved();
            });
          }}
        >
          <p className="text-xs text-[var(--text-muted)]">
            Fix the Token / Pre-dispatch / Final split entered at Won. Receivables and the
            remaining balance use these amounts when there is no accepted quotation.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Token (₹)</Label>
              <Input type="number" min={0} step="0.01" value={token} onChange={(e) => setToken(e.target.value)} />
            </div>
            <div>
              <Label>Pre-dispatch (₹)</Label>
              <Input type="number" min={0} step="0.01" value={pre} onChange={(e) => setPre(e.target.value)} />
            </div>
            <div>
              <Label>Final (₹)</Label>
              <Input type="number" min={0} step="0.01" value={final} onChange={(e) => setFinal(e.target.value)} />
            </div>
          </div>
          <p className="text-xs font-semibold text-[var(--text-dark)]">
            New total: {formatCurrency(draftTotal)}
          </p>
          <div>
            <Label>Reason for correction</Label>
            <Textarea
              rows={2}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Full amount was entered as Token"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save plan"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
