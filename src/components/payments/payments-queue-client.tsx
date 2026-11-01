"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verifyPayment, rejectPayment, deletePayment } from "@/actions/payments";
import { CorrectPaymentButton } from "@/components/leads/payment-correction";
import {
  PAYMENT_MILESTONE_LABELS,
  PAYMENT_STATUS_LABELS,
  type PaymentMilestone,
  type PaymentVerificationStatus,
} from "@/lib/domain/payments";
import { useRkRefresh } from "@/lib/local-first/use-rk-refresh";
import { formatCurrency, formatDate } from "@/lib/utils";

type QueueProfile = { id: string; name: string } | null;

type QueueRow = {
  id: string;
  milestone: string;
  amount: number;
  method: string;
  transaction_id: string | null;
  paid_at: string | null;
  verification_status: string;
  lead?: {
    id: string;
    name: string;
    phone: string;
    city: string | null;
    sales_stage: string;
    dealer_id?: string | null;
    assigned_profile?: QueueProfile;
    telecaller_profile?: QueueProfile;
    dealer_profile?: QueueProfile;
  } | null;
};

function salesOrDealerLabel(lead: QueueRow["lead"]): { kind: string; name: string } {
  if (!lead) return { kind: "Sales / Dealer", name: "â€”" };
  if (lead.dealer_profile?.name || lead.dealer_id) {
    return { kind: "Dealer", name: lead.dealer_profile?.name ?? "â€”" };
  }
  const salesName =
    lead.telecaller_profile?.name ?? lead.assigned_profile?.name ?? null;
  return { kind: "Sales", name: salesName ?? "â€”" };
}

export function PaymentsQueueClient({
  initialRows,
  canVerify,
  canDelete,
}: {
  initialRows: QueueRow[];
  canVerify: boolean;
  canDelete?: boolean;
}) {
  const rkRefresh = useRkRefresh();
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();
  const [bankRef, setBankRef] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Sales / Dealer</th>
              <th className="px-3 py-2">Milestone</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Txn / date</th>
              <th className="px-3 py-2">Status</th>
              {(canVerify || canDelete) && <th className="px-3 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const owner = salesOrDealerLabel(row.lead);
              return (
              <tr key={row.id} className="border-b border-[var(--border-light)] align-top">
                <td className="px-3 py-2">
                  <p className="font-medium text-[var(--text-dark)]">
                    {row.lead?.name ?? "â€”"}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {row.lead?.phone}
                    {row.lead?.city ? ` Â· ${row.lead.city}` : ""}
                  </p>
                </td>
                <td className="px-3 py-2">
                  <p className="font-medium text-[var(--text-dark)]">{owner.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{owner.kind}</p>
                </td>
                <td className="px-3 py-2">
                  {PAYMENT_MILESTONE_LABELS[row.milestone as PaymentMilestone] ??
                    row.milestone}
                </td>
                <td className="px-3 py-2 font-semibold">
                  {formatCurrency(Number(row.amount))}
                </td>
                <td className="px-3 py-2 text-xs">
                  <p>{row.transaction_id ?? "â€”"}</p>
                  <p className="text-[var(--text-muted)]">{formatDate(row.paid_at)}</p>
                </td>
                <td className="px-3 py-2">
                  {PAYMENT_STATUS_LABELS[
                    row.verification_status as PaymentVerificationStatus
                  ] ?? row.verification_status}
                </td>
                {(canVerify || canDelete) && (
                  <td className="px-3 py-2">
                    <div className="flex min-w-[180px] flex-col gap-2">
                      {canVerify && (
                        <>
                      <Input
                        placeholder="Bank reference"
                        value={bankRef[row.id] ?? ""}
                        onChange={(e) =>
                          setBankRef((s) => ({ ...s, [row.id]: e.target.value }))
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
                                  paymentId: row.id,
                                  bankReference: bankRef[row.id] ?? "",
                                });
                                if (!result.ok) {
                                  setError(result.error);
                                  return;
                                }
                                setRows((prev) => prev.filter((r) => r.id !== row.id));
                                rkRefresh(["payments", "dashboard", "customers", "receivables"]);
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
                                  paymentId: row.id,
                                  reason: "Rejected from payments queue",
                                });
                                if (!result.ok) {
                                  setError(result.error);
                                  return;
                                }
                                setRows((prev) => prev.filter((r) => r.id !== row.id));
                                rkRefresh(["payments", "dashboard", "customers", "receivables"]);
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Failed");
                              }
                            })
                          }
                        >
                          Reject
                        </Button>
                      </div>
                      {row.verification_status !== "rejected" && (
                        <CorrectPaymentButton
                          payment={row as Parameters<typeof CorrectPaymentButton>[0]["payment"]}
                          onSaved={(u) => {
                            setRows((prev) =>
                              prev.map((r) =>
                                r.id === row.id
                                  ? {
                                      ...r,
                                      amount: u.amount,
                                      method: u.method,
                                      transaction_id: u.transactionId,
                                      paid_at: u.paidAt,
                                    }
                                  : r
                              )
                            );
                            rkRefresh(["payments", "dashboard", "customers", "receivables"]);
                          }}
                        />
                      )}
                        </>
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
                              const result = await deletePayment({ paymentId: row.id });
                              if (!result.ok) {
                                setError(result.error);
                                return;
                              }
                              setRows((prev) => prev.filter((r) => r.id !== row.id));
                              rkRefresh(["payments", "dashboard", "customers", "receivables"]);
                            });
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={canVerify || canDelete ? 7 : 6}
                  className="px-3 py-10 text-center text-[var(--text-muted)]"
                >
                  No pending payments.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

