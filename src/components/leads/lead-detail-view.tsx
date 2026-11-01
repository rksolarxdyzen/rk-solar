"use client";

import { useState } from "react";
import { StageStepper } from "@/components/leads/stage-stepper";
import { SalesActionsPanel } from "@/components/leads/sales-actions-panel";
import { LeadActivityPanel } from "@/components/leads/lead-activity-panel";
import { LeadReassignPanel } from "@/components/leads/lead-reassign-panel";
import { AuditTimeline } from "@/components/leads/audit-timeline";
import { LeadDocsPanel } from "@/components/leads/lead-docs-panel";
import { DeleteLeadButton } from "@/components/leads/delete-lead-button";
import { EditLeadButton } from "@/components/leads/edit-lead-button";
import { MoveToWonButton } from "@/components/leads/move-to-won-button";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { Badge } from "@/components/ui/badge";
import {
  LEAD_SOURCE_LABELS,
  SALES_STAGE_LABELS,
  TEMPERATURE_LABELS,
} from "@/lib/domain/workflow";
import { profileFieldLabels } from "@/lib/leads/won-gate";
import { formatDateTime, formatPhone, cn } from "@/lib/utils";
import { useOptionalLocalFirstSession } from "@/components/local-first/local-first-session";
import { queueableMoveStage } from "@/lib/local-first/queueable-crm";
import type { LeadWithRelations } from "@/lib/domain/types";
import type { SalesStage } from "@/lib/domain/workflow";

const TABS = [
  { id: "details", label: "Details" },
  { id: "sales", label: "Sales" },
  { id: "docs", label: "Docs" },
  { id: "activity", label: "Activity" },
  { id: "reassign", label: "Reassign" },
  { id: "audit", label: "Audit" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function LeadDetailView({
  lead,
  onRefresh,
  canEditLead = false,
  canScheduleVisit = true,
  canConductSurvey = true,
  canCreateQuotations = false,
  canMarkWon = false,
  canRecordPayment = false,
  canVerifyPayment = false,
  canDeletePayment = false,
  canUploadFeasibility = false,
  canApproveFeasibility = false,
  canAssignInstall = false,
  canUploadInstall = false,
  canCompleteInstall = false,
  canLiaison = false,
  canVerifySubsidy = false,
  canManagePortalDocs = false,
  canSubmitCommission = false,
  canApproveCommission = false,
  canAssignDealer = false,
  canDeleteLead = false,
}: {
  lead: LeadWithRelations;
  onRefresh: () => void;
  canEditLead?: boolean;
  canScheduleVisit?: boolean;
  canConductSurvey?: boolean;
  canCreateQuotations?: boolean;
  canMarkWon?: boolean;
  canRecordPayment?: boolean;
  canVerifyPayment?: boolean;
  canDeletePayment?: boolean;
  canUploadFeasibility?: boolean;
  canApproveFeasibility?: boolean;
  canAssignInstall?: boolean;
  canUploadInstall?: boolean;
  canCompleteInstall?: boolean;
  canLiaison?: boolean;
  canVerifySubsidy?: boolean;
  canManagePortalDocs?: boolean;
  canSubmitCommission?: boolean;
  canApproveCommission?: boolean;
  canAssignDealer?: boolean;
  canDeleteLead?: boolean;
}) {
  const [tab, setTab] = useState<TabId>("sales");
  const [moving, setMoving] = useState(false);
  const session = useOptionalLocalFirstSession();
  const { openCustomer } = useLeadModal();
  const showMoveToWon =
    canMarkWon &&
    (lead.sales_stage === "survey_completed" || lead.sales_stage === "quoted");

  async function handleStageClick(stage: SalesStage) {
    if (moving || stage === lead.sales_stage || !session?.userId) return;
    setMoving(true);
    try {
      const result = await queueableMoveStage(session.userId, lead.id, stage);
      if (result.ok) onRefresh();
    } catch {
      /* surfaced elsewhere */
    } finally {
      setMoving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={lead.temperature}>
              {TEMPERATURE_LABELS[lead.temperature]}
            </Badge>
            <Badge variant={lead.sales_stage}>
              {SALES_STAGE_LABELS[lead.sales_stage]}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            {formatPhone(lead.phone)}
            {lead.city ? ` · ${lead.city}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {LEAD_SOURCE_LABELS[lead.source] ?? lead.source}
            {` · TC: ${lead.telecaller_profile?.name ?? lead.assigned_profile?.name ?? "—"}`}
            {` · SV: ${lead.surveyor_profile?.name ?? "—"}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEditLead && <EditLeadButton lead={lead} onDone={onRefresh} />}
          {canDeleteLead && (
            <DeleteLeadButton leadId={lead.id} leadName={lead.name} kind="lead" />
          )}
        </div>
      </div>

      {lead.sales_stage !== "lost" && (
        <StageStepper
          current={lead.sales_stage}
          onStageClick={handleStageClick}
          disabled={moving}
          variant="minimal"
        />
      )}

      {showMoveToWon && (
        <MoveToWonButton
          leadId={lead.id}
          leadName={lead.name}
          onWon={() => openCustomer(lead.id)}
        />
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition",
              tab === t.id
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-dark)]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Detail label="Email" value={lead.email} />
          <Detail label="Alternate phone" value={lead.alternate_phone} />
          <Detail label="Address" value={lead.address} className="sm:col-span-2" />
          <Detail
            label="Requirement"
            value={lead.requirement_notes}
            className="sm:col-span-2"
          />
          {(() => {
            const profile = profileFieldLabels(lead);
            return (
              <>
                <Detail label="Meter type" value={profile.meterType} />
                <Detail label="Meter ownership" value={profile.meterOwnership} />
                <Detail label="Payment plan" value={profile.paymentPlan} />
              </>
            );
          })()}
          <Detail
            label="Tele-caller"
            value={lead.telecaller_profile?.name ?? lead.assigned_profile?.name}
          />
          <Detail label="Surveyor" value={lead.surveyor_profile?.name} />
          <Detail
            label="Visit scheduled"
            value={
              lead.visit_scheduled_at ? formatDateTime(lead.visit_scheduled_at) : null
            }
          />
          <Detail label="Visit notes" value={lead.visit_notes} />
          {lead.survey?.completed_at && (
            <>
              <Detail
                label="Geo"
                value={
                  lead.survey.latitude != null && lead.survey.longitude != null
                    ? `${lead.survey.latitude}, ${lead.survey.longitude}`
                    : null
                }
              />
              <Detail
                label="Terrace / shadow-free"
                value={`${lead.survey.total_terrace_sqft ?? "—"} / ${lead.survey.shadow_free_sqft ?? "—"} sq.ft`}
              />
              <Detail
                label="Capacity"
                value={
                  lead.survey.capacity_kw != null ? `${lead.survey.capacity_kw} kW` : null
                }
              />
              <Detail
                label="Feasibility"
                value={
                  lead.survey.feasibility_pass == null
                    ? null
                    : lead.survey.feasibility_pass
                      ? "Pass"
                      : "Fail"
                }
              />
              <Detail
                label="Survey notes"
                value={lead.survey.notes}
                className="sm:col-span-2"
              />
            </>
          )}
          <Detail
            label="Next follow-up"
            value={
              lead.next_followup_at
                ? `${formatDateTime(lead.next_followup_at)}${
                    lead.next_followup_action ? ` — ${lead.next_followup_action}` : ""
                  }`
                : null
            }
            className="sm:col-span-2"
          />
          {lead.loss_reason && (
            <Detail
              label="Loss reason"
              value={`${lead.loss_reason}${lead.loss_notes ? ` — ${lead.loss_notes}` : ""}`}
              className="sm:col-span-2"
            />
          )}
          <Detail label="Created" value={formatDateTime(lead.created_at)} />
          <Detail label="Total calls" value={String(lead.total_calls ?? 0)} />
        </div>
      )}

      {tab === "sales" && (
        <SalesActionsPanel
          lead={lead}
          onDone={onRefresh}
          canScheduleVisit={canScheduleVisit}
          canConductSurvey={canConductSurvey}
          canCreateQuotations={canCreateQuotations}
          canRecordPayment={canRecordPayment}
          canVerifyPayment={canVerifyPayment}
          canDeletePayment={canDeletePayment}
          canUploadFeasibility={canUploadFeasibility}
          canApproveFeasibility={canApproveFeasibility}
          canAssignInstall={canAssignInstall}
          canUploadInstall={canUploadInstall}
          canCompleteInstall={canCompleteInstall}
          canLiaison={canLiaison}
          canVerifySubsidy={canVerifySubsidy}
          canManagePortalDocs={canManagePortalDocs}
          canSubmitCommission={canSubmitCommission}
          canApproveCommission={canApproveCommission}
          canAssignDealer={canAssignDealer}
        />
      )}
      {tab === "docs" && (
        <LeadDocsPanel
          leadId={lead.id}
          canUpload={canManagePortalDocs || canLiaison}
        />
      )}
      {tab === "activity" && <LeadActivityPanel lead={lead} onDone={onRefresh} />}
      {tab === "reassign" && <LeadReassignPanel lead={lead} onDone={onRefresh} />}
      {tab === "audit" && <AuditTimeline leadId={lead.id} />}
    </div>
  );
}

function Detail({
  label,
  value,
  className,
}: {
  label: string;
  value: string | null | undefined;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-[var(--text-dark)]">{value?.trim() || "—"}</p>
    </div>
  );
}
