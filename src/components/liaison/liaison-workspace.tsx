"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { PreInstallQueueItem } from "@/actions/feasibility";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { DealerCommissionPanel } from "@/components/dealers/dealer-commission-panel";
import { PreInstallFeasibilityQueue } from "@/components/liaison/pre-install-feasibility-queue";
import {
  enqueueOverdueSubsidyFollowUps,
  markMeterInstalled,
  markSubsidyReceived,
  verifySubsidy,
} from "@/actions/liaison";
import { daysUntilSubsidyDue, isSubsidyTimerOverdue } from "@/lib/domain/portal";
import { SALES_STAGE_LABELS } from "@/lib/domain/workflow";
import type { SalesStage } from "@/lib/domain/workflow";
import { formatDateTime } from "@/lib/utils";

export type DocumentationTab = "pre-install" | "post-install";

export type LiaisonQueueItem = {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  sales_stage: SalesStage;
  portal_code: string | null;
  meter_installed_at: string | null;
  subsidy_timer_due_at: string | null;
  subsidy_received_at: string | null;
  subsidy_verified_at: string | null;
  subsidy_followup_sent_at?: string | null;
  completion_certificate_url: string | null;
  installation_completed_at: string | null;
  dealer_id?: string | null;
  overdue?: boolean;
  portalUrl?: string | null;
};

export function LiaisonWorkspace({
  leads,
  preInstallLeads = [],
  initialTab = "post-install",
  canLiaison,
  canVerifySubsidy,
  canUploadFeasibility = false,
  canSubmitCommission = false,
  canApproveCommission = false,
  canAssignDealer = false,
}: {
  leads: LiaisonQueueItem[];
  preInstallLeads?: PreInstallQueueItem[];
  initialTab?: DocumentationTab;
  canLiaison: boolean;
  canVerifySubsidy: boolean;
  canUploadFeasibility?: boolean;
  canSubmitCommission?: boolean;
  canApproveCommission?: boolean;
  canAssignDealer?: boolean;
}) {
  const router = useRouter();
  const showPre = canUploadFeasibility || canLiaison;
  const showPost = canLiaison || canVerifySubsidy;
  const [tab, setTab] = useState<DocumentationTab>(() => {
    if (initialTab === "pre-install" && showPre) return "pre-install";
    if (showPost) return "post-install";
    return "pre-install";
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [promptLeadId, setPromptLeadId] = useState<string | null>(null);
  const [bankRefs, setBankRefs] = useState<Record<string, string>>({});

  function refresh(msg: string) {
    setMessage(msg);
    router.refresh();
  }

  function selectTab(next: DocumentationTab) {
    setTab(next);
    router.replace(next === "pre-install" ? "/liaison?tab=pre-install" : "/liaison");
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Documentation"
        subtitle={
          tab === "pre-install" ? (
            <>
              <p>
                Won files waiting for a grid feasibility report (PDF or photo). Upload clears the docs
                gate — no approval step.
              </p>
              <p className="mt-0.5">
                Installation still waits for Accounts to verify token and pre-dispatch.
              </p>
            </>
          ) : (
            <>
              <p>Discom liaison, meter &amp; subsidy steps, and customer document vault.</p>
              <p className="mt-0.5">Meter install, 15-day subsidy timer, Accounts verify</p>
            </>
          )
        }
        className="mb-0"
        actions={
          canLiaison && tab === "post-install" ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    const r = await enqueueOverdueSubsidyFollowUps();
                    refresh(
                      r.enqueued
                        ? `Queued ${r.enqueued} overdue follow-up(s)`
                        : "No overdue timers needing follow-up"
                    );
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed");
                  }
                })
              }
            >
              Queue overdue follow-ups
            </Button>
          ) : undefined
        }
      />

      {(showPre || showPost) && (
        <div className="flex flex-wrap gap-2">
          {showPre && (
            <Button
              type="button"
              size="sm"
              variant={tab === "pre-install" ? "primary" : "secondary"}
              onClick={() => selectTab("pre-install")}
            >
              Pre-install
              {preInstallLeads.length > 0 ? ` (${preInstallLeads.length})` : ""}
            </Button>
          )}
          {showPost && (
            <Button
              type="button"
              size="sm"
              variant={tab === "post-install" ? "primary" : "secondary"}
              onClick={() => selectTab("post-install")}
            >
              Post-install
              {leads.length > 0 ? ` (${leads.length})` : ""}
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {message && <p className="text-sm text-[var(--success)]">{message}</p>}

      {tab === "pre-install" && showPre && (
        <PreInstallFeasibilityQueue
          leads={preInstallLeads}
          canUpload={canUploadFeasibility}
        />
      )}

      {tab === "post-install" && showPost &&
        (leads.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
          No liaison jobs in queue
        </p>
      ) : (
        <ul className="space-y-3">
          {leads.map((lead) => {
            const overdue = isSubsidyTimerOverdue(lead);
            const daysLeft = daysUntilSubsidyDue(lead.subsidy_timer_due_at);
            return (
              <li
                key={lead.id}
                className={`rounded-xl border bg-white p-4 ${
                  overdue ? "border-[var(--error)]" : "border-[var(--border)]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-semibold text-[var(--primary)] hover:underline"
                    >
                      {lead.name}
                    </Link>
                    <p className="text-xs text-[var(--text-muted)]">
                      {SALES_STAGE_LABELS[lead.sales_stage] ?? lead.sales_stage}
                      {lead.portal_code ? ` · Portal ${lead.portal_code}` : ""}
                    </p>
                    {lead.subsidy_timer_due_at && !lead.subsidy_received_at && (
                      <p
                        className={`mt-1 text-xs ${overdue ? "font-semibold text-[var(--error)]" : "text-[var(--text-muted)]"}`}
                      >
                        Timer due {formatDateTime(lead.subsidy_timer_due_at)}
                        {daysLeft != null ? ` (${daysLeft}d)` : ""}
                        {overdue ? " — OVERDUE" : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canLiaison &&
                      (lead.sales_stage === "liaison_in_progress" ||
                        lead.sales_stage === "installation_completed") && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              setError(null);
                              try {
                                await markMeterInstalled({ leadId: lead.id });
                                refresh("Meter marked installed");
                              } catch (err) {
                                setError(
                                  err instanceof Error ? err.message : "Failed"
                                );
                              }
                            })
                          }
                        >
                          Meter installed
                        </Button>
                      )}
                    {canLiaison &&
                      Boolean(lead.meter_installed_at) &&
                      !lead.subsidy_received_at &&
                      (lead.sales_stage === "subsidy_pending" ||
                        lead.sales_stage === "meter_installed") && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              setError(null);
                              try {
                                await markSubsidyReceived({ leadId: lead.id });
                                refresh("Subsidy marked received");
                              } catch (err) {
                                setError(
                                  err instanceof Error ? err.message : "Failed"
                                );
                              }
                            })
                          }
                        >
                          Subsidy received
                        </Button>
                      )}
                  </div>
                </div>

                {canVerifySubsidy &&
                  lead.sales_stage === "subsidy_received_pending_accounts" && (
                    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--border-light)] pt-3">
                      <div className="min-w-[180px] flex-1">
                        <Label>Bank reference</Label>
                        <Input
                          value={bankRefs[lead.id] ?? ""}
                          onChange={(e) =>
                            setBankRefs((s) => ({
                              ...s,
                              [lead.id]: e.target.value,
                            }))
                          }
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
                              const result = await verifySubsidy({
                                leadId: lead.id,
                                bankReference: bankRefs[lead.id] ?? "",
                              });
                              if (result.needsCommissionForm) {
                                setPromptLeadId(lead.id);
                                refresh(
                                  "Project completed — enter dealer commission below"
                                );
                              } else {
                                refresh("Project completed");
                              }
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : "Failed"
                              );
                            }
                          })
                        }
                      >
                        Verify & complete
                      </Button>
                    </div>
                  )}

                {promptLeadId === lead.id && (
                  <DealerCommissionPanel
                    leadId={lead.id}
                    dealerId={lead.dealer_id}
                    salesStage="completed"
                    forceOpen
                    canSubmit={canSubmitCommission}
                    canApprove={canApproveCommission}
                    canAssign={canAssignDealer}
                    onDone={() => {
                      setPromptLeadId(null);
                      router.refresh();
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      ))}
    </div>
  );
}
