"use client";

import { useEffect, useMemo, useState, useTransition, type SyntheticEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Trophy, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { getWonGateContext, markLeadWon } from "@/actions/leads";
import { uploadLeadDocument } from "@/actions/liaison";
import {
  checkWonClosingGate,
  paymentBreakdownTotal,
  WON_MANDATORY_DOC_LABELS,
  WON_MANDATORY_DOC_TYPES,
  WON_OPTIONAL_DOC_LABELS,
  WON_OPTIONAL_DOC_TYPES,
  type WonClosingPayload,
  type WonMandatoryDocType,
  type WonOptionalDocType,
} from "@/lib/leads/won-gate";
import { cn, formatCurrency } from "@/lib/utils";
import { friendlyUploadError } from "@/lib/uploads/proof-mime";
import { prepareProofFileForUpload } from "@/lib/uploads/prepare-proof-file";

type GateContext = Awaited<ReturnType<typeof getWonGateContext>>;
type WonQuoteOption = GateContext["quotations"][number];

type WonFormState = {
  panelName: string;
  panelQuantity: number;
  inverterCompany: string;
  systemSizeKw: number;
  tokenAmount: number;
  preDispatchAmount: number;
  finalAmount: number;
  acceptedQuotationId: string;
  consumerNumber: string;
  companyBearsSubsidy: boolean;
};

const EMPTY_FORM: WonFormState = {
  panelName: "",
  panelQuantity: 1,
  inverterCompany: "",
  systemSizeKw: 0,
  tokenAmount: 0,
  preDispatchAmount: 0,
  finalAmount: 0,
  acceptedQuotationId: "",
  consumerNumber: "",
  companyBearsSubsidy: false,
};

function panelLabelFromQuote(quote: WonQuoteOption) {
  return [quote.module_company_name, quote.module_type_name, quote.module_capacity_label]
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function MoveToWonButton({
  leadId,
  leadName,
  variant = "banner",
  onWon,
}: {
  leadId: string;
  leadName: string;
  variant?: "banner" | "card" | "header";
  onWon?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ctx, setCtx] = useState<GateContext | null>(null);
  const [form, setForm] = useState<WonFormState>(EMPTY_FORM);
  const [uploading, setUploading] = useState<string | null>(null);
  const router = useRouter();

  function stopCardEvents(event: SyntheticEvent) {
    event.stopPropagation();
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getWonGateContext(leadId)
      .then((data) => {
        if (cancelled) return;
        setCtx(data);
        setForm({
          panelName: data.defaults.panelName,
          panelQuantity: data.defaults.panelQuantity,
          inverterCompany: data.defaults.inverterCompany,
          systemSizeKw: data.defaults.systemSizeKw,
          tokenAmount: data.defaults.tokenAmount,
          preDispatchAmount: data.defaults.preDispatchAmount,
          finalAmount: data.defaults.finalAmount,
          acceptedQuotationId: data.defaults.acceptedQuotationId ?? "",
          consumerNumber: data.defaults.consumerNumber ?? "",
          companyBearsSubsidy: Boolean(data.defaults.companyBearsSubsidy),
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load Won requirements");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, leadId]);

  const liveGate = useMemo(
    () => checkWonClosingGate(form as Partial<WonClosingPayload>, ctx?.docTypes ?? []),
    [form, ctx?.docTypes]
  );

  const paymentTotal = paymentBreakdownTotal(form);
  const selectedQuote =
    ctx?.quotations.find((q) => q.id === form.acceptedQuotationId) ?? null;

  function applyQuote(quoteId: string) {
    const quote = ctx?.quotations.find((q) => q.id === quoteId) ?? null;
    if (!quote) {
      setForm((f) => ({ ...f, acceptedQuotationId: "" }));
      return;
    }
    setForm((f) => ({
      ...f,
      acceptedQuotationId: quote.id,
      panelName: panelLabelFromQuote(quote) || f.panelName,
      panelQuantity: quote.panel_count || f.panelQuantity,
      systemSizeKw: quote.system_size_kw || f.systemSizeKw,
      finalAmount:
        f.tokenAmount === 0 && f.preDispatchAmount === 0
          ? quote.grand_total ?? f.finalAmount
          : f.finalAmount,
    }));
  }

  function confirm() {
    const gate = checkWonClosingGate(form as Partial<WonClosingPayload>, ctx?.docTypes ?? []);
    if (!gate.passed) {
      setError(gate.blockedReasons.join(". "));
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await markLeadWon(leadId, {
          panelName: form.panelName,
          panelQuantity: form.panelQuantity,
          inverterCompany: form.inverterCompany,
          systemSizeKw: form.systemSizeKw > 0 ? form.systemSizeKw : null,
          tokenAmount: form.tokenAmount,
          preDispatchAmount: form.preDispatchAmount,
          finalAmount: form.finalAmount,
          acceptedQuotationId: form.acceptedQuotationId || null,
          consumerNumber: form.consumerNumber,
          companyBearsSubsidy: form.companyBearsSubsidy,
          meterType: ctx?.defaults.meterType ?? null,
          meterOwnership: ctx?.defaults.meterOwnership ?? null,
          paymentPlan: ctx?.defaults.paymentPlan ?? null,
        });
        setOpen(false);
        router.refresh();
        onWon?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to mark Won");
      }
    });
  }

  async function onUpload(
    docType: WonMandatoryDocType | WonOptionalDocType,
    file: File | null
  ) {
    if (!file) return;
    setUploading(docType);
    setError(null);
    try {
      const prepared = await prepareProofFileForUpload(file);
      const fd = new FormData();
      fd.set("leadId", leadId);
      fd.set("docType", docType);
      fd.set(
        "title",
        docType in WON_MANDATORY_DOC_LABELS
          ? WON_MANDATORY_DOC_LABELS[docType as WonMandatoryDocType]
          : WON_OPTIONAL_DOC_LABELS[docType as WonOptionalDocType]
      );
      fd.set("file", prepared);
      await uploadLeadDocument(fd);
      const refreshed = await getWonGateContext(leadId);
      setCtx(refreshed);
    } catch (err) {
      setError(friendlyUploadError(err));
    } finally {
      setUploading(null);
    }
  }

  const trigger =
    variant === "card" ? (
      <button
        type="button"
        disabled={pending}
        onClick={(event) => {
          stopCardEvents(event);
          setOpen(true);
        }}
        onPointerDown={stopCardEvents}
        onMouseDown={stopCardEvents}
        onDragStart={stopCardEvents}
        draggable={false}
        className="rounded-md bg-[var(--success)] px-2.5 py-1.5 text-[0.7rem] font-semibold text-white hover:bg-[var(--success)]/90 disabled:opacity-45"
      >
        Move to Won
      </button>
    ) : variant === "header" ? (
      <Button type="button" size="sm" variant="success" onClick={() => setOpen(true)}>
        Move to Won
      </Button>
    ) : (
      <Button type="button" variant="success" className="w-full sm:w-auto" onClick={() => setOpen(true)}>
        Move to Won
      </Button>
    );

  return (
    <>
      {variant === "banner" ? (
        <div className="space-y-3 rounded-xl border border-[var(--success)]/40 bg-[var(--success-light)]/50 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--success)]/15">
              <Trophy className="h-4 w-4 text-[var(--success)]" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-[var(--text-dark)]">Won confirmation gate</h3>
              <p className="mt-0.5 text-sm text-[var(--text-body)]">
                Select the sales quotation, confirm system &amp; payment breakdown, and upload
                mandatory documents before converting to a customer.
              </p>
            </div>
          </div>
          {trigger}
        </div>
      ) : (
        trigger
      )}

      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Confirm Won"
        subtitle={`Complete required sections to convert ${leadName}`}
        size="lg"
        layer="nested"
      >
        <div className="space-y-6">
          {loading ? (
            <p className="text-sm text-[var(--text-muted)]">Loading requirements…</p>
          ) : (
            <>
              <section className="space-y-3">
                <h3 className="text-sm font-bold text-[var(--text-dark)]">
                  1. Approved / sales quotation
                </h3>
                {(ctx?.quotations.length ?? 0) === 0 ? (
                  <p className="rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg)] px-3 py-3 text-sm text-[var(--text-muted)]">
                    No quotations found for this lead yet. You can still confirm Won after filling
                    system details below.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {ctx!.quotations.map((quote) => {
                      const active = form.acceptedQuotationId === quote.id;
                      return (
                        <li key={quote.id}>
                          <button
                            type="button"
                            onClick={() => applyQuote(quote.id)}
                            className={cn(
                              "flex w-full flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition",
                              active
                                ? "border-[var(--success)] bg-[var(--success-light)]/50 ring-1 ring-[var(--success)]/30"
                                : "border-[var(--border)] bg-white hover:bg-[var(--bg)]"
                            )}
                          >
                            <span className="text-sm font-semibold text-[var(--text-dark)]">
                              {quote.quotation_no}
                            </span>
                            <p className="text-xs text-[var(--text-muted)]">
                              {quote.grand_total != null
                                ? formatCurrency(quote.grand_total)
                                : "—"}
                              {quote.system_size_kw
                                ? ` · ${quote.system_size_kw} kW`
                                : ""}
                              {quote.panel_count ? ` · ${quote.panel_count} panels` : ""}
                            </p>
                            {panelLabelFromQuote(quote) ? (
                              <p className="text-xs text-[var(--text-body)]">
                                {panelLabelFromQuote(quote)}
                              </p>
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {selectedQuote ? (
                  <p className="text-xs text-[var(--success)]">
                    Selected {selectedQuote.quotation_no}
                  </p>
                ) : null}
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-bold text-[var(--text-dark)]">
                  2. System technical details
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="won-panel">Panel / module brand & capacity</Label>
                    <Input
                      id="won-panel"
                      value={form.panelName}
                      onChange={(e) => setForm((f) => ({ ...f, panelName: e.target.value }))}
                      placeholder="e.g. Waaree 540W Mono"
                    />
                  </div>
                  <div>
                    <Label htmlFor="won-qty">Panel quantity</Label>
                    <Input
                      id="won-qty"
                      type="number"
                      min={1}
                      value={form.panelQuantity || ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, panelQuantity: Number(e.target.value) || 0 }))
                      }
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="won-inverter">Inverter brand</Label>
                    <Input
                      id="won-inverter"
                      value={form.inverterCompany}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, inverterCompany: e.target.value }))
                      }
                      placeholder="e.g. Polycab"
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <h3 className="text-sm font-bold text-[var(--text-dark)]">
                    3. Final payment breakdown
                  </h3>
                  <p className="text-xs font-semibold text-[var(--text-muted)]">
                    Total {formatCurrency(paymentTotal)}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="won-token">Token</Label>
                    <Input
                      id="won-token"
                      type="number"
                      min={0}
                      value={form.tokenAmount || ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, tokenAmount: Number(e.target.value) || 0 }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="won-pre">Pre-dispatch</Label>
                    <Input
                      id="won-pre"
                      type="number"
                      min={0}
                      value={form.preDispatchAmount || ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          preDispatchAmount: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="won-final">Final</Label>
                    <Input
                      id="won-final"
                      type="number"
                      min={0}
                      value={form.finalAmount || ""}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, finalAmount: Number(e.target.value) || 0 }))
                      }
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-bold text-[var(--text-dark)]">
                  3b. Consumer &amp; company subsidy
                </h3>
                <div>
                  <Label htmlFor="won-consumer">Consumer number</Label>
                  <Input
                    id="won-consumer"
                    value={form.consumerNumber}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, consumerNumber: e.target.value }))
                    }
                    placeholder="Electricity / GEB consumer number"
                  />
                </div>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border)] bg-white px-3 py-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-[var(--border)]"
                    checked={form.companyBearsSubsidy}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, companyBearsSubsidy: e.target.checked }))
                    }
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text-dark)]">
                      Subsidy pending — company will bear / recover subsidy
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                      Tick if RK pays subsidy upfront. Accounts sees this as subsidy pending
                      (from the quotation subsidy amount). Leave unticked if the customer
                      bears subsidy.
                    </span>
                    {form.companyBearsSubsidy && selectedQuote?.subsidy != null ? (
                      <span className="mt-1 block text-xs font-semibold text-[var(--primary)]">
                        Quotation subsidy: {formatCurrency(selectedQuote.subsidy)}
                      </span>
                    ) : null}
                  </span>
                </label>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-bold text-[var(--text-dark)]">
                  4. Documents
                </h3>
                <ul className="space-y-2">
                  {WON_MANDATORY_DOC_TYPES.map((docType) => {
                    const present = (ctx?.docTypes ?? []).includes(docType);
                    return (
                      <li
                        key={docType}
                        className={cn(
                          "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5",
                          present
                            ? "border-[var(--success)]/40 bg-[var(--success-light)]/40"
                            : "border-[var(--border)] bg-white"
                        )}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          {present ? (
                            <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                          ) : (
                            <Upload className="h-4 w-4 text-[var(--text-muted)]" />
                          )}
                          <span className="font-semibold text-[var(--text-dark)]">
                            {WON_MANDATORY_DOC_LABELS[docType]}
                          </span>
                          <span className="text-[0.65rem] font-semibold uppercase text-[var(--error)]">
                            Required
                          </span>
                          {present && (
                            <span className="text-xs text-[var(--success)]">Uploaded</span>
                          )}
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]">
                          {uploading === docType ? "Uploading…" : present ? "Replace" : "Upload"}
                          <input
                            type="file"
                            accept="image/*,.pdf,application/pdf"
                            className="hidden"
                            disabled={uploading !== null || pending}
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              e.target.value = "";
                              void onUpload(docType, file);
                            }}
                          />
                        </label>
                      </li>
                    );
                  })}
                  {WON_OPTIONAL_DOC_TYPES.map((docType) => {
                    const present = (ctx?.docTypes ?? []).includes(docType);
                    return (
                      <li
                        key={docType}
                        className={cn(
                          "flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5",
                          present
                            ? "border-[var(--success)]/40 bg-[var(--success-light)]/40"
                            : "border-[var(--border)] bg-white"
                        )}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          {present ? (
                            <CheckCircle2 className="h-4 w-4 text-[var(--success)]" />
                          ) : (
                            <Upload className="h-4 w-4 text-[var(--text-muted)]" />
                          )}
                          <span className="font-semibold text-[var(--text-dark)]">
                            {WON_OPTIONAL_DOC_LABELS[docType]}
                          </span>
                          <span className="text-[0.65rem] font-semibold uppercase text-[var(--text-muted)]">
                            Optional
                          </span>
                          {present && (
                            <span className="text-xs text-[var(--success)]">Uploaded</span>
                          )}
                        </div>
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white px-2.5 py-1.5 text-xs font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]">
                          {uploading === docType ? "Uploading…" : present ? "Replace" : "Upload"}
                          <input
                            type="file"
                            accept="image/*,.pdf,application/pdf"
                            className="hidden"
                            disabled={uploading !== null || pending}
                            onChange={(e) => {
                              const file = e.target.files?.[0] ?? null;
                              e.target.value = "";
                              void onUpload(docType, file);
                            }}
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {!liveGate.passed && (
                <ul className="rounded-lg border border-[var(--warn)]/30 bg-[var(--warn-light)] px-3 py-2 text-xs text-[var(--warn)]">
                  {liveGate.blockedReasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              )}
            </>
          )}

          {error && (
            <p className="rounded-lg border border-red-200 bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border-light)] pt-4 sm:flex-row sm:justify-end">
            <Button variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="success"
              disabled={pending || loading || !liveGate.passed}
              onClick={confirm}
            >
              {pending ? "Confirming…" : "Confirm Won"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
