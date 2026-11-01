"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, Phone, MessageCircle } from "lucide-react";
import { LeadDetailView } from "@/components/leads/lead-detail-view";
import { LeadHeaderActions } from "@/components/leads/lead-header-actions";
import { ModalBackButton } from "@/components/leads/modal-back-button";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import {
  invalidateLeadDetail,
  leadDetailOptions,
} from "@/lib/local-first/queries/lead-detail";
import { leadShellToPlaceholder } from "@/lib/leads/lead-shell";
import { formatPhone, cn } from "@/lib/utils";

function whatsappHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

export function LeadDetailModal({
  canEditLead = false,
  canDeleteLead = false,
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
}: {
  canEditLead?: boolean;
  canDeleteLead?: boolean;
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
}) {
  const { leadId, modalKind, shell, closeLead } = useLeadModal();
  const { companyId } = useLocalFirstSession();
  const queryClient = useQueryClient();
  const open = Boolean(leadId && modalKind === "lead");
  const placeholder =
    open && leadId && shell?.id === leadId
      ? leadShellToPlaceholder(shell, companyId)
      : undefined;

  const {
    data: lead,
    isPending,
    isFetching,
    isPlaceholderData,
    refetch,
  } = useQuery({
    ...leadDetailOptions(companyId, leadId ?? ""),
    enabled: open && Boolean(leadId),
    placeholderData: placeholder,
  });
  const shellPaint = Boolean(isPlaceholderData || (lead && placeholder && isPending));

  async function refresh(id: string) {
    invalidateLeadDetail(queryClient, companyId, id);
    await refetch();
  }

  useEffect(() => {
    if (!leadId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLead();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leadId, closeLead]);

  if (!open || !leadId) return null;

  // Cached / shell paint: only spin when we have nothing at all.
  const showSpinner = isPending && !lead;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 sm:items-center sm:p-4 sm:backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeLead();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[94dvh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-[var(--shadow-lg)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[var(--radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] p-4 sm:p-5">
          <div className="min-w-0">
            <ModalBackButton onClick={closeLead} />
            <h2 className="truncate font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)]">
              {lead?.name ?? "Lead"}
              {(isFetching || shellPaint) && lead ? (
                <span className="ml-2 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Syncing
                </span>
              ) : null}
            </h2>
            {lead && (
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={`tel:${lead.phone}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-faint)]"
                  )}
                >
                  <Phone className="h-3.5 w-3.5" />
                  {formatPhone(lead.phone)}
                </a>
                <a
                  href={whatsappHref(lead.phone)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--success)] hover:bg-[var(--success-light)]"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              </div>
            )}
          </div>
          <div className="flex min-w-0 shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
            {lead && !shellPaint && (
              <LeadHeaderActions
                lead={lead}
                onDone={() => void refresh(lead.id)}
                canScheduleVisit={canScheduleVisit}
                canConductSurvey={canConductSurvey}
                canCreateQuotations={canCreateQuotations}
              />
            )}
            <button
              type="button"
              onClick={closeLead}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg)]"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {showSpinner && (
            <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {!showSpinner && !lead && (
            <p className="py-12 text-center text-sm text-[var(--text-muted)]">
              Lead not found or you do not have access.
            </p>
          )}
          {lead && (
            <LeadDetailView
              lead={lead}
              canEditLead={canEditLead && !shellPaint}
              canDeleteLead={canDeleteLead && !shellPaint}
              canScheduleVisit={canScheduleVisit && !shellPaint}
              canConductSurvey={canConductSurvey && !shellPaint}
              canCreateQuotations={canCreateQuotations && !shellPaint}
              canMarkWon={canMarkWon && !shellPaint}
              canRecordPayment={canRecordPayment && !shellPaint}
              canVerifyPayment={canVerifyPayment && !shellPaint}
              canDeletePayment={canDeletePayment && !shellPaint}
              canUploadFeasibility={canUploadFeasibility && !shellPaint}
              canApproveFeasibility={canApproveFeasibility && !shellPaint}
              canAssignInstall={canAssignInstall && !shellPaint}
              canUploadInstall={canUploadInstall && !shellPaint}
              canCompleteInstall={canCompleteInstall && !shellPaint}
              canLiaison={canLiaison && !shellPaint}
              canVerifySubsidy={canVerifySubsidy && !shellPaint}
              canManagePortalDocs={canManagePortalDocs && !shellPaint}
              canSubmitCommission={canSubmitCommission && !shellPaint}
              canApproveCommission={canApproveCommission && !shellPaint}
              canAssignDealer={canAssignDealer && !shellPaint}
              onRefresh={() => void refresh(lead.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
