"use client";

import { useEffect, useState } from "react";
import { DeleteLeadButton } from "@/components/leads/delete-lead-button";
import { EditLeadButton } from "@/components/leads/edit-lead-button";
import { LeadActivityPanel } from "@/components/leads/lead-activity-panel";
import { LeadDocsPanel } from "@/components/leads/lead-docs-panel";
import { PaymentPanel } from "@/components/leads/payment-panel";
import { FeasibilityPanel } from "@/components/leads/feasibility-panel";
import { LiaisonPanel } from "@/components/leads/liaison-panel";
import { QuotePlaceholderCard } from "@/components/leads/survey-complete-panel";
import {
  MaterialTab,
  type InventoryModalAccess,
} from "@/components/inventory/material-tab";
import {
  CUSTOMER_PHASES,
  LEAD_SOURCE_LABELS,
  type CustomerPhaseId,
} from "@/lib/domain/workflow";
import { profileFieldLabels } from "@/lib/leads/won-gate";
import { cn, formatDateTime } from "@/lib/utils";
import type { LeadWithRelations } from "@/lib/domain/types";
import { portalPath } from "@/lib/domain/portal";

const BASE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "payments", label: "Payments" },
  { id: "docs", label: "Docs" },
  { id: "liaison", label: "Discom" },
  { id: "activity", label: "History" },
] as const;

type BaseTabId = (typeof BASE_TABS)[number]["id"];
type TabId = BaseTabId | "material";

function formatCompanySubsidyDetail(lead: LeadWithRelations): string {
  if (lead.company_bears_subsidy !== true) {
    if (lead.company_bears_subsidy === false) return "Customer bears subsidy (set at Won)";
    return "Not set at Won";
  }
  const amount = Number(lead.subsidy_amount_at_won);
  const amountText =
    lead.subsidy_amount_at_won != null && Number.isFinite(amount) && amount > 0
      ? `₹${amount.toLocaleString("en-IN")}`
      : "Amount not captured";
  if (lead.subsidy_verified_at) {
    return `Company bears · ${amountText} · Verified ${formatDateTime(lead.subsidy_verified_at)}`;
  }
  if (lead.subsidy_received_at) {
    return `Company bears · ${amountText} · Received from customer, pending Accounts verification`;
  }
  return `Company bears · ${amountText} · Pending`;
}

function phaseFor(stage: LeadWithRelations["sales_stage"]): CustomerPhaseId | null {
  return CUSTOMER_PHASES.find((phase) => phase.stages.includes(stage))?.id ?? null;
}

function defaultTab(stage: LeadWithRelations["sales_stage"]): TabId {
  const phase = phaseFor(stage);
  if (phase === "payments") return "payments";
  if (phase === "liaison" || phase === "completed") return "liaison";
  return "overview";
}

export function CustomerDetailView({
  lead,
  onRefresh,
  canEditLead = false,
  canCreateQuotations = false,
  canRecordPayment = false,
  canVerifyPayment = false,
  canDeletePayment = false,
  canUploadFeasibility = false,
  canApproveFeasibility = false,
  canLiaison = false,
  canVerifySubsidy = false,
  canManagePortalDocs = false,
  canSubmitCommission = false,
  canApproveCommission = false,
  canAssignDealer = false,
  canDeleteLead = false,
  inventoryAccess = null,
}: {
  lead: LeadWithRelations;
  onRefresh: () => void;
  canEditLead?: boolean;
  canCreateQuotations?: boolean;
  canRecordPayment?: boolean;
  canVerifyPayment?: boolean;
  canDeletePayment?: boolean;
  canUploadFeasibility?: boolean;
  canApproveFeasibility?: boolean;
  canLiaison?: boolean;
  canVerifySubsidy?: boolean;
  canManagePortalDocs?: boolean;
  canSubmitCommission?: boolean;
  canApproveCommission?: boolean;
  canAssignDealer?: boolean;
  canDeleteLead?: boolean;
  inventoryAccess?: InventoryModalAccess | null;
}) {
  const [tab, setTab] = useState<TabId>(defaultTab(lead.sales_stage));
  const tabs = [
    ...BASE_TABS,
    ...(inventoryAccess?.view ? [{ id: "material" as const, label: "Material" }] : []),
  ];

  useEffect(() => {
    setTab(defaultTab(lead.sales_stage));
  }, [lead.id, lead.sales_stage]);

  return (
    <div className="space-y-4">
      {(canEditLead || canDeleteLead) && (
        <div className="flex flex-wrap justify-end gap-2">
          {canEditLead && <EditLeadButton lead={lead} onDone={onRefresh} />}
          {canDeleteLead && (
            <DeleteLeadButton leadId={lead.id} leadName={lead.name} kind="customer" />
          )}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-[var(--border)]">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition",
              tab === item.id
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-dark)]"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Email" value={lead.email} />
            <Detail label="Alternate phone" value={lead.alternate_phone} />
            <Detail label="City" value={lead.city} />
            <Detail label="Source" value={LEAD_SOURCE_LABELS[lead.source] ?? lead.source} />
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
            <Detail label="Consumer number" value={lead.consumer_number} />
            <Detail
              label="Company subsidy (Won)"
              value={formatCompanySubsidyDetail(lead)}
            />
            <Detail
              label="Tele-caller"
              value={lead.telecaller_profile?.name ?? lead.assigned_profile?.name}
            />
            <Detail label="Surveyor" value={lead.surveyor_profile?.name} />
            {lead.survey?.capacity_kw != null && (
              <Detail label="Survey capacity" value={`${lead.survey.capacity_kw} kW`} />
            )}
            {lead.expected_panel_count != null && (
              <Detail label="Expected panels" value={String(lead.expected_panel_count)} />
            )}
            <Detail label="Created" value={formatDateTime(lead.created_at)} />
            <Detail label="Reference person" value={lead.referrer_name} />
            <Detail label="Reference phone" value={lead.referrer_phone} />
            {lead.portal_code && (
              <Detail label="Customer portal code" value={lead.portal_code} />
            )}
          </div>
          {lead.portal_code && (
            <a
              href={portalPath(lead.portal_code)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-sm font-semibold text-[var(--primary)]"
            >
              Open customer portal →
            </a>
          )}
          <QuotePlaceholderCard lead={lead} canCreate={canCreateQuotations} />
        </div>
      )}

      {tab === "payments" && (
        <div className="space-y-4">
          {lead.sales_stage === "quoted" && (
            <p className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-6 text-sm text-[var(--text-muted)]">
              Milestone payments start after the quotation is accepted (Won).
            </p>
          )}
          <PaymentPanel
            lead={lead}
            onDone={onRefresh}
            canRecord={canRecordPayment}
            canVerify={canVerifyPayment}
            canDelete={canDeletePayment}
          />
          <FeasibilityPanel
            lead={lead}
            onDone={onRefresh}
            canUpload={canUploadFeasibility}
            canApprove={canApproveFeasibility}
          />
        </div>
      )}

      {tab === "docs" && (
        <LeadDocsPanel
          leadId={lead.id}
          canUpload={canManagePortalDocs || canLiaison}
        />
      )}

      {tab === "liaison" && (
        <LiaisonPanel
          lead={lead}
          onDone={onRefresh}
          canLiaison={canLiaison}
          canVerifySubsidy={canVerifySubsidy}
          canManageDocs={canManagePortalDocs}
          canSubmitCommission={canSubmitCommission}
          canApproveCommission={canApproveCommission}
          canAssignDealer={canAssignDealer}
        />
      )}

      {tab === "activity" && <LeadActivityPanel lead={lead} onDone={onRefresh} />}

      {tab === "material" && inventoryAccess?.view && (
        <MaterialTab leadId={lead.id} access={inventoryAccess} />
      )}
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
