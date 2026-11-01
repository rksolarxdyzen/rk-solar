"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Users, X } from "lucide-react";
import { CustomerDetailView } from "@/components/leads/customer-detail-view";
import { CustomerHeaderActions } from "@/components/leads/customer-header-actions";
import { ModalBackButton } from "@/components/leads/modal-back-button";
import { QuotePlaceholderCard } from "@/components/leads/survey-complete-panel";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import type { InventoryModalAccess } from "@/components/inventory/material-tab";
import {
  invalidateLeadDetail,
  leadDetailOptions,
} from "@/lib/local-first/queries/lead-detail";
import { leadShellToPlaceholder } from "@/lib/leads/lead-shell";
import type { SalesStage } from "@/lib/domain/workflow";

function inventoryAccessFromAuths(authorities: Iterable<string>): InventoryModalAccess | null {
  const set = authorities instanceof Set ? authorities : new Set(authorities);
  const has = (k: string) => set.has("full_access") || set.has(k);
  const view = has("view_inventory") || has("manage_inventory_items");
  if (!view) return null;
  return {
    view: true,
    dispatch: has("inventory_dispatch"),
    return: has("inventory_return"),
  };
}

export function CustomerDetailModal({
  canEditLead = false,
  canDeleteLead = false,
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
}: {
  canEditLead?: boolean;
  canDeleteLead?: boolean;
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
}) {
  const { leadId, modalKind, shell, closeLead } = useLeadModal();
  const router = useRouter();
  const { companyId, authorities } = useLocalFirstSession();
  const inventoryAccess = inventoryAccessFromAuths(authorities);
  const queryClient = useQueryClient();
  const open = Boolean(leadId && modalKind === "customer");
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
    router.refresh();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLead();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeLead]);

  if (!open || !leadId) return null;

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
        aria-label="Customer"
        className="flex max-h-[94dvh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-[var(--shadow-lg)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[var(--radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <ModalBackButton onClick={closeLead} />
            <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
              <Users className="h-3.5 w-3.5" />
              Customer
            </p>
            <h2 className="mt-1 truncate font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)]">
              {lead?.name ?? "Customer"}
              {(isFetching || shellPaint) && lead ? (
                <span className="ml-2 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Syncing
                </span>
              ) : null}
            </h2>
            {lead && (
              <div className="mt-2">
                <CustomerHeaderActions
                  name={lead.name}
                  phone={lead.phone}
                  portalCode={lead.portal_code}
                  salesStage={lead.sales_stage as SalesStage}
                  city={lead.city}
                />
              </div>
            )}
          </div>
          <div className="flex min-w-0 shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
            {lead && !shellPaint && (
              <QuotePlaceholderCard
                lead={lead}
                canCreate={canCreateQuotations}
                variant="header"
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
              Customer not found or you do not have access.
            </p>
          )}
          {lead && (
            <CustomerDetailView
              lead={lead}
              onRefresh={() => void refresh(lead.id)}
              canEditLead={canEditLead && !shellPaint}
              canDeleteLead={canDeleteLead && !shellPaint}
              canCreateQuotations={canCreateQuotations && !shellPaint}
              canRecordPayment={canRecordPayment && !shellPaint}
              canVerifyPayment={canVerifyPayment && !shellPaint}
              canDeletePayment={canDeletePayment && !shellPaint}
              canUploadFeasibility={canUploadFeasibility && !shellPaint}
              canApproveFeasibility={canApproveFeasibility && !shellPaint}
              canLiaison={canLiaison && !shellPaint}
              canVerifySubsidy={canVerifySubsidy && !shellPaint}
              canManagePortalDocs={canManagePortalDocs && !shellPaint}
              canSubmitCommission={canSubmitCommission && !shellPaint}
              canApproveCommission={canApproveCommission && !shellPaint}
              canAssignDealer={canAssignDealer && !shellPaint}
              inventoryAccess={inventoryAccess}
            />
          )}
        </div>
      </div>
    </div>
  );
}
