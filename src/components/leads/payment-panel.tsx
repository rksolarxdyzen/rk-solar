"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  listPaymentsForLead,
  getLeadQuoteGrandTotal,
  getLeadSettlementDiscount,
  recordPayment,
  verifyPayment,
  rejectPayment,
  deletePayment,
  reconcileVerifiedPaymentStages,
} from "@/actions/payments";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_MILESTONE_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHODS,
  nextRecordableMilestone,
  type PaymentMilestone,
  type PaymentMethod,
  type PaymentRow,
} from "@/lib/domain/payments";
import { summarizeLeadPaymentBalance } from "@/lib/domain/payment-balance";
import {
  CorrectPaymentButton,
  SettlementDiscountSummary,
  WonPlanSummary,
} from "@/components/leads/payment-correction";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { LeadWithRelations } from "@/lib/domain/types";

export function PaymentPanel({
  lead,
  onDone,
  canRecord = false,
  canVerify = false,
  canDelete = false,
}: {
  lead: LeadWithRelations;
  onDone: () => void;
  canRecord?: boolean;
  canVerify?: boolean;
  canDelete?: boolean;
}) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [quoteGrandTotal, setQuoteGrandTotal] = useState<number | null>(null);
  const [discount, setDiscount] = useState<{ amount: number; reason: string | null }>({
    amount: 0,
    reason: null,
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [transactionId, setTransactionId] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [bankRef, setBankRef] = useState<Record<string, string>>({});
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const nextMilestone = nextRecordableMilestone(lead.sales_stage, payments);

  const balance = useMemo(
    () =>
      summarizeLeadPaymentBalance({
        quoteGrandTotal,
        wonTokenAmount: lead.won_token_amount,
        wonPreDispatchAmount: lead.won_pre_dispatch_amount,
        wonFinalAmount: lead.won_final_amount,
        settlementDiscount: discount.amount,
        payments: payments.map((p) => ({
          amount: Number(p.amount),
          verification_status: p.verification_status,
        })),
      }),
    [
      quoteGrandTotal,
      lead.won_token_amount,
      lead.won_pre_dispatch_amount,
      lead.won_final_amount,
      discount.amount,
      payments,
    ]
  );

  async function reload() {
    let stageSynced = false;
    try {
      stageSynced = await reconcileVerifiedPaymentStages(lead.id);
    } catch {
      stageSynced = false;
    }
    const [rows, total, disc] = await Promise.all([
      listPaymentsForLead(lead.id),
      getLeadQuoteGrandTotal(lead.id).catch(() => null),
      getLeadSettlementDiscount(lead.id).catch(() => ({ amount: 0, reason: null })),
    ]);
    setPayments(rows);
    setQuoteGrandTotal(total);
    setDiscount(disc);
    if (stageSynced) onDone();
  }

  useEffect(() => {
    void reload().catch(() => setPayments([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, lead.accepted_quotation_id]);

  if (
    ![
      "quote_accepted",
      "token_pending_verification",
      "token_verified_and_feasibility_ok",
      "pre_dispatch_pending_verification",
      "pre_dispatch_verified",
      "installation_assigned",
      "installation_in_progress",
      "installation_completed",
      "final_pending_verification",
      "final_verified",
    ].includes(lead.sales_stage) &&
    !canDelete
  ) {
    return null;
  }

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-4">
      <div>
        <h3 className="font-semibold text-[var(--text-dark)]">Milestone payments</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Token → Pre-dispatch → Final. Accounts verifies money. Feasibility PDF
          is Documentation (independent). Token{" "}
          {lead.token_verified ? "verified" : "not verified"} · PDF{" "}
          {lead.feasibility_approved ? "on file" : "waiting"}
        </p>
      </div>

      {balance.projectTotal != null && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-[var(--bg)] px-3 py-2">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Project total
            </p>
            <p className="mt-0.5 text-sm font-bold text-[var(--text-dark)]">
              {formatCurrency(balance.projectTotal)}
            </p>
            <p className="mt-0.5 text-[0.65rem] text-[var(--text-muted)]">
              {balance.source === "quotation" ? "Accepted quote" : "Won plan"}
            </p>
          </div>
          <div className="rounded-lg bg-[var(--success-light)] px-3 py-2">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--success)]">
              Paid
            </p>
            <p className="mt-0.5 text-sm font-bold text-[var(--text-dark)]">
              {formatCurrency(balance.paid)}
            </p>
            {balance.pending > 0 ? (
              <p className="mt-0.5 text-[0.65rem] text-[var(--warn)]">
                {formatCurrency(balance.pending)} pending
              </p>
            ) : null}
          </div>
          <div className="rounded-lg bg-[var(--warn-light)] px-3 py-2">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--warn)]">
              Remaining
            </p>
            <p className="mt-0.5 text-sm font-bold text-[var(--text-dark)]">
              {balance.remaining == null ? "—" : formatCurrency(balance.remaining)}
            </p>
            {balance.discount > 0 ? (
              <p className="mt-0.5 text-[0.65rem] text-[var(--text-muted)]">
                after {formatCurrency(balance.discount)} discount
              </p>
            ) : null}
          </div>
        </div>
      )}

      <SettlementDiscountSummary
        key={`${discount.amount}-${discount.reason ?? ""}`}
        leadId={lead.id}
        amount={discount.amount}
        reason={discount.reason}
        remainingBeforeDiscount={
          balance.projectTotal == null
            ? null
            : Math.max(0, Math.round((balance.projectTotal - balance.paid) * 100) / 100)
        }
        canEdit={canVerify}
        onSaved={async () => {
          await reload();
          onDone();
        }}
      />

      <WonPlanSummary
        key={`${lead.won_token_amount}-${lead.won_pre_dispatch_amount}-${lead.won_final_amount}`}
        leadId={lead.id}
        tokenAmount={Number(lead.won_token_amount) || 0}
        preDispatchAmount={Number(lead.won_pre_dispatch_amount) || 0}
        finalAmount={Number(lead.won_final_amount) || 0}
        canCorrect={canVerify}
        onSaved={async () => {
          await reload();
          onDone();
        }}
      />

      <ul className="space-y-2 text-sm">
        {payments.map((p) => (
          <li
            key={p.id}
            className="rounded-lg border border-[var(--border-light)] px-3 py-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-[var(--text-dark)]">
                  {PAYMENT_MILESTONE_LABELS[p.milestone as PaymentMilestone]} ·{" "}
                  {formatCurrency(Number(p.amount))}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {PAYMENT_STATUS_LABELS[p.verification_status]} · Txn{" "}
                  {p.transaction_id ?? "—"} · {formatDate(p.paid_at)}
                </p>
                {p.bank_reference && (
                  <p className="text-xs text-[var(--text-body)]">
                    Bank: {p.bank_reference}
                  </p>
                )}
              </div>
              {canVerify && p.verification_status === "pending" && (
                <div className="flex min-w-[200px] flex-col gap-2">
                  <Input
                    placeholder="Bank reference"
                    value={bankRef[p.id] ?? ""}
                    onChange={(e) =>
                      setBankRef((s) => ({ ...s, [p.id]: e.target.value }))
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          setError(null);
                          try {
                            const result = await verifyPayment({
                              paymentId: p.id,
                              bankReference: bankRef[p.id] ?? "",
                            });
                            if (!result.ok) {
                              setError(result.error);
                              return;
                            }
                            await reload();
                            onDone();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed");
                          }
                        })
                      }
                    >
                      Verify
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          setError(null);
                          try {
                            const result = await rejectPayment({
                              paymentId: p.id,
                              reason: rejectReason[p.id] || "Rejected by Accounts",
                            });
                            if (!result.ok) {
                              setError(result.error);
                              return;
                            }
                            await reload();
                            onDone();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed");
                          }
                        })
                      }
                    >
                      Reject
                    </Button>
                  </div>
                  <Input
                    placeholder="Reject reason"
                    value={rejectReason[p.id] ?? ""}
                    onChange={(e) =>
                      setRejectReason((s) => ({ ...s, [p.id]: e.target.value }))
                    }
                  />
                </div>
              )}
              {canVerify && p.verification_status !== "rejected" && (
                <CorrectPaymentButton
                  payment={p}
                  onSaved={async () => {
                    await reload();
                    onDone();
                  }}
                />
              )}
              {canDelete && (
                <Button
                  type="button"
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !window.confirm(
                        "Delete this payment? This cannot be undone. You can record it again afterwards.",
                      )
                    ) {
                      return;
                    }
                    startTransition(async () => {
                      setError(null);
                      const result = await deletePayment({ paymentId: p.id });
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      await reload();
                      onDone();
                    });
                  }}
                >
                  Delete
                </Button>
              )}
            </div>
          </li>
        ))}
        {payments.length === 0 && (
          <li className="text-xs text-[var(--text-muted)]">No payments recorded yet.</li>
        )}
      </ul>

      {canRecord && nextMilestone && (
        <form
          className="space-y-3 border-t border-[var(--border-light)] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              try {
                const result = await recordPayment({
                  leadId: lead.id,
                  milestone: nextMilestone,
                  amount: Number(amount),
                  method,
                  transactionId,
                  paidAt,
                  notes: notes || null,
                  quotationId: lead.accepted_quotation_id ?? null,
                });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setAmount("");
                setTransactionId("");
                setNotes("");
                await reload();
                onDone();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed");
              }
            });
          }}
        >
          <p className="text-sm font-semibold text-[var(--text-dark)]">
            Record {PAYMENT_MILESTONE_LABELS[nextMilestone]}
          </p>
          {balance.remaining != null && balance.remaining > 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              Max remaining vs quotation / Won plan: {formatCurrency(balance.remaining)}
            </p>
          ) : null}
          {balance.remaining === 0 ? (
            <p className="rounded-lg border border-[var(--warn)] bg-[var(--warn-light)] px-3 py-2 text-xs text-[var(--text-dark)]">
              Nothing left to collect: recorded payments ({formatCurrency(balance.paid)}
              {balance.pending > 0 ? `, incl. ${formatCurrency(balance.pending)} pending` : ""})
              already cover the project total of {formatCurrency(balance.projectTotal ?? 0)} (
              {balance.source === "quotation" ? "accepted quote" : "Won plan"}).{" "}
              {canVerify
                ? "Use Correct on the wrong payment or Correct plan above to fix the amounts."
                : "Ask Accounts to correct the wrong payment amount or the Won payment plan."}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                min={1}
                max={balance.remaining != null && balance.remaining > 0 ? balance.remaining : undefined}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Method</Label>
              <select
                className="w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm"
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
              <Label>{method === "cash" ? "Receipt / reference" : "Transaction ID"}</Label>
              <Input
                required
                placeholder={method === "cash" ? "Cash (optional — defaults to Cash)" : undefined}
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
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Record payment"}
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
    </div>
  );
}
