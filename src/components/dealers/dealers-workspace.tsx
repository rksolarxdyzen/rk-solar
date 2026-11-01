"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  getDealerDetail,
  reviewDealerCommission,
  type DealerDetailCommission,
  type DealerDetailFile,
  type DealerDirectoryRow,
} from "@/actions/dealers";
import {
  COMMISSION_STATUS_LABELS,
  type CommissionStatus,
} from "@/lib/domain/dealers";
import { SALES_STAGE_LABELS, type SalesStage } from "@/lib/domain/workflow";
import { formatDateTime, formatPhone } from "@/lib/utils";
import { useLeadModal } from "@/components/leads/lead-modal-context";

function formatInr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function DealersWorkspace({
  dealers,
  canApprove = false,
}: {
  dealers: DealerDirectoryRow[];
  canApprove?: boolean;
}) {
  const router = useRouter();
  const { openCustomer, openLead } = useLeadModal();
  const [pending, startTransition] = useTransition();
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [dealer, setDealer] = useState<DealerDirectoryRow | null>(null);
  const [files, setFiles] = useState<DealerDetailFile[]>([]);
  const [commissions, setCommissions] = useState<DealerDetailCommission[]>([]);
  const [detailTotals, setDetailTotals] = useState<{
    filesInRange: number;
    paidAllTime: number;
    paidThisMonthInr: number;
    shortlyDueInr: number;
  } | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return dealers;
    return dealers.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.phone.includes(q) ||
        (d.email ?? "").toLowerCase().includes(q)
    );
  }, [dealers, filter]);

  async function openDetail(row: DealerDirectoryRow, range?: { from?: string; to?: string }) {
    setSelectedId(row.id);
    setDealer(row);
    setDetailLoading(true);
    setDetailError(null);
    setActionMsg(null);
    try {
      const data = await getDealerDetail(row.id, {
        from: range?.from ?? (dateFrom || null),
        to: range?.to ?? (dateTo || null),
      });
      setFiles(data.files);
      setCommissions(data.commissions);
      setDetailTotals(data.totals);
      setDealer({
        ...row,
        name: data.dealer.name,
        phone: data.dealer.phone,
        email: data.dealer.email,
        is_active: data.dealer.is_active,
        created_at: data.dealer.created_at,
      });
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Failed to load");
      setFiles([]);
      setCommissions([]);
      setDetailTotals(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function openFile(file: DealerDetailFile) {
    if (
      file.sales_stage === "completed" ||
      file.sales_stage === "quote_accepted" ||
      file.sales_stage.startsWith("token_") ||
      file.sales_stage.startsWith("pre_dispatch") ||
      file.sales_stage.startsWith("installation") ||
      file.sales_stage.startsWith("final_") ||
      file.sales_stage.startsWith("liaison") ||
      file.sales_stage.startsWith("meter_") ||
      file.sales_stage.startsWith("subsidy")
    ) {
      openCustomer(file.id);
    } else {
      openLead(file.id);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Settings"
        title="Dealers"
        subtitle="Dealer profiles, shortly due payouts, paid this month, and linked files"
        className="mb-0"
        actions={
          <Link
            href="/reports/dealers"
            className="inline-flex h-9 items-center rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--primary-faint)]"
          >
            Monthly report
          </Link>
        }
      />

      <div className="max-w-sm">
        <Label htmlFor="dealer-search">Search</Label>
        <Input
          id="dealer-search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Name, phone, or email"
        />
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
          No dealers yet. Create a user with the Dealer role under Team & Access.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {visible.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => void openDetail(d)}
                className="w-full rounded-xl border border-[var(--border)] bg-white p-4 text-left transition hover:border-[var(--primary)]/40 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[var(--text-dark)]">{d.name}</p>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {formatPhone(d.phone)}
                      {d.email ? ` · ${d.email}` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      d.is_active
                        ? "bg-[var(--success-light,theme(colors.green.50))] text-[var(--success)]"
                        : "bg-[var(--bg)] text-[var(--text-muted)]"
                    }`}
                  >
                    {d.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--text-muted)]">
                  <div>
                    <dt>Files</dt>
                    <dd className="text-sm font-semibold text-[var(--text-dark)]">
                      {d.filesLinked}
                      <span className="font-normal text-[var(--text-muted)]">
                        {" "}
                        ({d.filesCompleted} done)
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Commissions</dt>
                    <dd className="text-sm font-semibold text-[var(--text-dark)]">
                      {d.commissionsApproved} approved
                      {d.commissionsPending > 0
                        ? ` · ${d.commissionsPending} pending`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt>Shortly due</dt>
                    <dd className="text-sm font-semibold text-[var(--warn)]">
                      {formatInr(d.shortlyDueInr)}
                    </dd>
                  </div>
                  <div>
                    <dt>Paid this month</dt>
                    <dd className="text-sm font-semibold text-[var(--text-dark)]">
                      {formatInr(d.paidThisMonthInr)}
                    </dd>
                  </div>
                </dl>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(selectedId)}
        onClose={() => setSelectedId(null)}
        title={dealer?.name ?? "Dealer"}
        subtitle={
          dealer
            ? `${formatPhone(dealer.phone)}${dealer.email ? ` · ${dealer.email}` : ""}`
            : undefined
        }
        size="xl"
      >
        {detailLoading ? (
          <p className="text-sm text-[var(--text-muted)]">Loading…</p>
        ) : detailError ? (
          <p className="text-sm text-[var(--error)]">{detailError}</p>
        ) : dealer ? (
          <div className="space-y-5">
            {actionMsg && (
              <p className="text-sm text-[var(--success)]">{actionMsg}</p>
            )}

            <dl className="grid gap-2 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Status</dt>
                <dd>{dealer.is_active ? "Active" : "Inactive"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Joined</dt>
                <dd>{formatDateTime(dealer.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Approved commission</dt>
                <dd>{formatInr(dealer.approvedAmountInr)}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Shortly due</dt>
                <dd className="font-semibold text-[var(--warn)]">
                  {formatInr(detailTotals?.shortlyDueInr ?? dealer.shortlyDueInr)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Paid this month</dt>
                <dd>
                  {formatInr(detailTotals?.paidThisMonthInr ?? dealer.paidThisMonthInr)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Paid all time</dt>
                <dd>{formatInr(detailTotals?.paidAllTime ?? dealer.approvedAmountInr)}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg)] p-3">
              <div>
                <Label htmlFor="dealer-from">Files from</Label>
                <Input
                  id="dealer-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="dealer-to">Files to</Label>
                <Input
                  id="dealer-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <Button
                type="button"
                size="sm"
                disabled={detailLoading || !dealer}
                onClick={() => void openDetail(dealer, { from: dateFrom, to: dateTo })}
              >
                Apply range
              </Button>
              <p className="text-xs text-[var(--text-muted)]">
                {detailTotals
                  ? `${detailTotals.filesInRange} files in range`
                  : `${files.length} files`}
              </p>
            </div>

            <section>
              <h4 className="mb-2 text-sm font-semibold text-[var(--text-dark)]">
                Linked files ({files.length})
              </h4>
              {files.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No files linked yet</p>
              ) : (
                <ul className="max-h-48 space-y-2 overflow-y-auto">
                  {files.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => openFile(f)}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-left text-sm hover:border-[var(--primary)]/40"
                      >
                        <span className="font-medium text-[var(--primary)]">
                          {f.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                          {SALES_STAGE_LABELS[f.sales_stage as SalesStage] ??
                            f.sales_stage}
                          {" · "}
                          {formatPhone(f.phone)}
                          {f.city ? ` · ${f.city}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="mb-2 text-sm font-semibold text-[var(--text-dark)]">
                Commissions ({commissions.length})
              </h4>
              {commissions.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No commission forms submitted
                </p>
              ) : (
                <ul className="space-y-3">
                  {commissions.map((c) => {
                    const statusLabel =
                      COMMISSION_STATUS_LABELS[c.status as CommissionStatus] ??
                      c.status;
                    return (
                      <li
                        key={c.id}
                        className="rounded-lg border border-[var(--border)] p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">
                              {c.lead?.name ?? "File"}
                              {c.lead ? (
                                <button
                                  type="button"
                                  className="ml-2 text-xs font-semibold text-[var(--primary)]"
                                  onClick={() =>
                                    c.lead && openCustomer(c.lead.id)
                                  }
                                >
                                  Open
                                </button>
                              ) : null}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              {c.amount_inr != null
                                ? formatInr(Number(c.amount_inr))
                                : "—"}
                              {c.percent != null ? ` · ${c.percent}%` : ""}
                              {" · "}
                              {statusLabel}
                              {" · "}
                              {formatDateTime(c.submitted_at)}
                            </p>
                            {c.notes && (
                              <p className="mt-1 text-xs text-[var(--text-body)]">
                                {c.notes}
                              </p>
                            )}
                            {c.review_notes && (
                              <p className="mt-1 text-xs text-[var(--text-muted)]">
                                Review: {c.review_notes}
                              </p>
                            )}
                          </div>
                        </div>
                        {canApprove && c.status === "pending" && (
                          <div className="mt-2 space-y-2 border-t border-[var(--border-light)] pt-2">
                            <Input
                              placeholder="Review notes (optional)"
                              value={reviewNotes[c.lead_id] ?? ""}
                              onChange={(e) =>
                                setReviewNotes((s) => ({
                                  ...s,
                                  [c.lead_id]: e.target.value,
                                }))
                              }
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={pending}
                                onClick={() =>
                                  startTransition(async () => {
                                    try {
                                      await reviewDealerCommission({
                                        leadId: c.lead_id,
                                        decision: "approved",
                                        reviewNotes:
                                          reviewNotes[c.lead_id] || undefined,
                                      });
                                      setActionMsg("Commission approved");
                                      await openDetail(dealer);
                                      router.refresh();
                                    } catch (err) {
                                      setDetailError(
                                        err instanceof Error
                                          ? err.message
                                          : "Failed"
                                      );
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
                                    try {
                                      await reviewDealerCommission({
                                        leadId: c.lead_id,
                                        decision: "rejected",
                                        reviewNotes:
                                          reviewNotes[c.lead_id] || undefined,
                                      });
                                      setActionMsg("Commission rejected");
                                      await openDetail(dealer);
                                      router.refresh();
                                    } catch (err) {
                                      setDetailError(
                                        err instanceof Error
                                          ? err.message
                                          : "Failed"
                                      );
                                    }
                                  })
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
