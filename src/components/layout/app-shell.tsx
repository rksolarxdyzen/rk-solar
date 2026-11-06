"use client";

import { BrandMark } from "@/components/brand/brand-mark";
import { PoweredByDyzen } from "@/components/brand/powered-by-dyzen";
import { AppNav } from "@/components/layout/app-nav";
import { AlertsDrawer } from "@/components/reminders/reminder-bell";
import { SoftLink } from "@/components/local-first/soft-link";
import { SignOutButton } from "@/components/local-first/sign-out-button";
import { SyncIndicator } from "@/components/local-first/sync-indicator";
import { RkSwRegister } from "@/components/local-first/rk-sw-register";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { ROLE_LABELS } from "@/lib/brand";
import type { Profile } from "@/lib/domain/types";
import type { AuthorityKey } from "@/lib/domain/authorities";
import { LeadModalProvider } from "@/components/leads/lead-modal-context";
import { LeadDetailModal } from "@/components/leads/lead-detail-modal";
import { InstallationDetailModal } from "@/components/leads/installation-detail-modal";
import { CustomerDetailModal } from "@/components/leads/customer-detail-modal";

export function AppShell({
  children,
  profile,
  authorities = [],
}: {
  children: React.ReactNode;
  profile: Profile;
  authorities?: AuthorityKey[];
}) {
  const navCtx = { authorities, role: profile.role };
  const canEditLead =
    authorities.includes("full_access") || authorities.includes("add_edit_leads");
  const canDeleteLead =
    authorities.includes("full_access") ||
    authorities.includes("delete_leads") ||
    profile.role === "admin";
  const canScheduleVisit =
    authorities.includes("full_access") ||
    authorities.includes("schedule_site_visit") ||
    profile.role === "admin" ||
    profile.role === "sales_manager";
  const canConductSurvey =
    authorities.includes("full_access") ||
    authorities.includes("conduct_survey") ||
    profile.role === "admin" ||
    profile.role === "sales_manager";
  const canCreateQuotations =
    authorities.includes("full_access") ||
    authorities.includes("create_quotations") ||
    authorities.includes("manage_quotations") ||
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive";
  const canMarkWon =
    authorities.includes("full_access") ||
    authorities.includes("move_lead_stage") ||
    authorities.includes("accept_quotations") ||
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive";
  const canRecordPayment =
    authorities.includes("full_access") ||
    authorities.includes("record_payment") ||
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    profile.role === "accounts";
  const canVerifyPayment =
    authorities.includes("full_access") ||
    authorities.includes("verify_payment") ||
    profile.role === "admin" ||
    profile.role === "accounts";
  const canDeletePayment =
    authorities.includes("full_access") || profile.role === "admin";
  const canUploadFeasibility =
    authorities.includes("full_access") ||
    authorities.includes("upload_feasibility_report") ||
    authorities.includes("manage_liaison") ||
    profile.role === "admin" ||
    profile.role === "feasibility" ||
    profile.role === "liaison" ||
    profile.role === "sales_manager";
  const canApproveFeasibility =
    authorities.includes("full_access") ||
    authorities.includes("approve_feasibility_report") ||
    profile.role === "admin" ||
    profile.role === "feasibility";
  const canAssignInstall =
    authorities.includes("full_access") ||
    authorities.includes("assign_installation_crew") ||
    profile.role === "admin" ||
    profile.role === "ops_coordinator";
  const canUploadInstall =
    authorities.includes("full_access") ||
    authorities.includes("upload_installation_proofs") ||
    authorities.includes("upload_panel_barcodes") ||
    profile.role === "admin" ||
    profile.role === "ops_coordinator" ||
    profile.role === "installation_crew";
  const canCompleteInstall =
    authorities.includes("full_access") ||
    authorities.includes("complete_installation") ||
    profile.role === "admin" ||
    profile.role === "ops_coordinator" ||
    profile.role === "installation_crew";
  const canLiaison =
    authorities.includes("full_access") ||
    authorities.includes("manage_liaison") ||
    authorities.includes("mark_meter_installed") ||
    authorities.includes("mark_subsidy_received") ||
    profile.role === "admin" ||
    profile.role === "liaison" ||
    profile.role === "sales_manager";
  const canVerifySubsidy =
    authorities.includes("full_access") ||
    authorities.includes("verify_subsidy") ||
    profile.role === "admin" ||
    profile.role === "accounts";
  const canManagePortalDocs =
    authorities.includes("full_access") ||
    authorities.includes("manage_portal_documents") ||
    profile.role === "admin" ||
    profile.role === "liaison" ||
    profile.role === "sales_manager";
  const canSubmitCommission =
    authorities.includes("full_access") ||
    authorities.includes("submit_dealer_commission") ||
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "accounts" ||
    profile.role === "dealer";
  const canApproveCommission =
    authorities.includes("full_access") ||
    authorities.includes("approve_dealer_commission") ||
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "accounts";
  const canAssignDealer =
    authorities.includes("full_access") ||
    authorities.includes("assign_dealer") ||
    profile.role === "admin" ||
    profile.role === "sales_manager";

  return (
    <LeadModalProvider>
      <RkSwRegister />
      <div className="min-h-screen bg-transparent">
        <header className="sticky top-0 z-40 overflow-visible border-b border-[var(--border)] bg-white/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 overflow-visible px-4 sm:px-6">
            <SoftLink href="/" aria-label="RK Bhabhor — Home">
              <BrandMark />
            </SoftLink>
            <div className="relative z-[45] flex items-center gap-2 overflow-visible sm:gap-3">
              <SyncIndicator />
              <InstallAppButton compact alwaysVisible size="sm" />
              <AlertsDrawer />
              <div className="hidden text-right sm:block">
                <p className="max-w-[10rem] truncate text-sm font-medium text-[var(--text-dark)]">
                  {profile.name}
                </p>
                <p className="text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  {ROLE_LABELS[profile.role] ?? profile.role}
                </p>
              </div>
              <SignOutButton />
            </div>
          </div>
          <div className="overflow-visible">
            <AppNav ctx={navCtx} />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
        <footer className="border-t border-[var(--border-light)] py-4">
          <PoweredByDyzen />
        </footer>
      </div>
      <LeadDetailModal
        canEditLead={canEditLead}
        canDeleteLead={canDeleteLead}
        canScheduleVisit={canScheduleVisit}
        canConductSurvey={canConductSurvey}
        canCreateQuotations={canCreateQuotations}
        canMarkWon={canMarkWon}
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
      <InstallationDetailModal
        canUploadInstall={canUploadInstall}
        canCompleteInstall={canCompleteInstall}
        canAssignInstall={canAssignInstall}
        hideStages={profile.role === "installation_crew"}
      />
      <CustomerDetailModal
        canEditLead={canEditLead}
        canDeleteLead={canDeleteLead}
        canCreateQuotations={canCreateQuotations}
        canRecordPayment={canRecordPayment}
        canVerifyPayment={canVerifyPayment}
        canDeletePayment={canDeletePayment}
        canUploadFeasibility={canUploadFeasibility}
        canApproveFeasibility={canApproveFeasibility}
        canLiaison={canLiaison}
        canVerifySubsidy={canVerifySubsidy}
        canManagePortalDocs={canManagePortalDocs}
        canSubmitCommission={canSubmitCommission}
        canApproveCommission={canApproveCommission}
        canAssignDealer={canAssignDealer}
      />
    </LeadModalProvider>
  );
}
