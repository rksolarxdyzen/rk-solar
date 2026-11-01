"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HardHat, Loader2, MessageCircle, Phone, X } from "lucide-react";
import { CrewInstallWorkspace } from "@/components/leads/crew-install-workspace";
import { CrewJobBriefCards } from "@/components/leads/crew-job-brief";
import { InstallationPanel } from "@/components/leads/installation-panel";
import { ModalBackButton } from "@/components/leads/modal-back-button";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { Badge } from "@/components/ui/badge";
import { getCrewJobBrief } from "@/actions/installation";
import {
  invalidateLeadDetail,
  leadDetailOptions,
} from "@/lib/local-first/queries/lead-detail";
import { leadShellToPlaceholder } from "@/lib/leads/lead-shell";
import { SALES_STAGE_LABELS } from "@/lib/domain/workflow";
import type { CrewJobBrief } from "@/lib/domain/installation";
import type { LeadWithRelations } from "@/lib/domain/types";
import { cn, formatPhone } from "@/lib/utils";

function whatsappHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

function leadFromBrief(brief: CrewJobBrief): Pick<
  LeadWithRelations,
  | "id"
  | "company_id"
  | "expected_panel_count"
  | "won_panel_quantity"
  | "sales_stage"
  | "installation_completed_at"
  | "inverter_serial_number"
  | "install_geo_lat"
  | "install_geo_lng"
> {
  return {
    id: brief.id,
    company_id: brief.company_id,
    expected_panel_count: brief.expected_panel_count,
    won_panel_quantity: brief.won_panel_quantity,
    sales_stage: brief.jobOpen ? "installation_in_progress" : "liaison_in_progress",
    installation_completed_at: brief.installation_completed_at,
    inverter_serial_number: brief.inverter_serial_number,
    install_geo_lat: brief.install_geo_lat,
    install_geo_lng: brief.install_geo_lng,
  };
}

export function InstallationDetailModal({
  canUploadInstall = false,
  canCompleteInstall = false,
  canAssignInstall = false,
  hideStages = false,
}: {
  canUploadInstall?: boolean;
  canCompleteInstall?: boolean;
  canAssignInstall?: boolean;
  hideStages?: boolean;
}) {
  const { leadId, modalKind, shell, closeLead } = useLeadModal();
  const router = useRouter();
  const { companyId } = useLocalFirstSession();
  const queryClient = useQueryClient();
  const open = Boolean(leadId && modalKind === "installation");

  const placeholder =
    open && leadId && shell?.id === leadId
      ? leadShellToPlaceholder(shell, companyId)
      : undefined;

  const {
    data: cachedLead,
    isPending: leadPending,
    isFetching: leadFetching,
    isPlaceholderData,
    refetch,
  } = useQuery({
    ...leadDetailOptions(companyId, leadId ?? ""),
    enabled: open && Boolean(leadId) && !hideStages,
    placeholderData: placeholder,
  });

  const [brief, setBrief] = useState<CrewJobBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const lead = hideStages ? null : cachedLead ?? null;
  const shellPaint = Boolean(
    !hideStages &&
      (isPlaceholderData || (lead && placeholder && leadPending))
  );

  async function refresh(id: string) {
    try {
      if (hideStages) {
        const result = await getCrewJobBrief(id);
        if (result.ok) setBrief(result.brief);
      } else {
        invalidateLeadDetail(queryClient, companyId, id);
        await refetch();
      }
      router.refresh();
    } catch {
      // Keep current job visible; avoid crashing the modal on refresh failures.
    }
  }

  useEffect(() => {
    if (!open || !leadId || !hideStages) {
      if (!hideStages) {
        setBrief(null);
        setLoadError(null);
        setBriefLoading(false);
      }
      return;
    }

    let cancelled = false;
    setBriefLoading(true);
    setLoadError(null);

    void getCrewJobBrief(leadId)
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setBrief(result.brief);
        } else {
          setBrief(null);
          setLoadError(result.error);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBrief(null);
          setLoadError("Cannot load this job");
        }
      })
      .finally(() => {
        if (!cancelled) setBriefLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, leadId, hideStages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLead();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeLead]);

  if (!open || !leadId) return null;

  const loading = hideStages ? briefLoading : leadPending && !lead;
  const showSpinner = loading && !lead && !brief && !placeholder;
  const headerName = brief?.name ?? lead?.name ?? placeholder?.name ?? "Customer";
  const headerPhone = brief?.phone ?? lead?.phone ?? placeholder?.phone;
  const headerCity = brief?.city ?? lead?.city ?? placeholder?.city;
  const headerPanels =
    brief?.expected_panel_count ??
    lead?.expected_panel_count ??
    placeholder?.expected_panel_count ??
    shell?.expected_panel_count;
  const headerStage = lead?.sales_stage ?? placeholder?.sales_stage ?? shell?.sales_stage;
  const syncing =
    (hideStages && briefLoading && Boolean(brief || placeholder)) ||
    (!hideStages && (leadFetching || shellPaint) && Boolean(lead));

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
        aria-label="Installation"
        className="flex max-h-[94dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-[var(--shadow-lg)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[var(--radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] p-4 sm:p-5">
          <div className="min-w-0">
            <ModalBackButton onClick={closeLead} />
            <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--info)]">
              <HardHat className="h-3.5 w-3.5" />
              Installation
            </p>
            <h2 className="mt-1 truncate font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)]">
              {headerName}
              {syncing ? (
                <span className="ml-2 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                  Syncing
                </span>
              ) : null}
            </h2>
            {(lead || brief || placeholder) && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!hideStages && headerStage && (
                  <Badge variant={headerStage}>
                    {SALES_STAGE_LABELS[headerStage]}
                  </Badge>
                )}
                {headerPanels != null && (
                  <span className="text-xs text-[var(--text-muted)]">{headerPanels} panels</span>
                )}
                {headerCity && (
                  <span className="text-xs text-[var(--text-muted)]">{headerCity}</span>
                )}
              </div>
            )}
            {headerPhone && (
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={`tel:${headerPhone}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-faint)]"
                  )}
                >
                  <Phone className="h-3.5 w-3.5" />
                  {formatPhone(headerPhone)}
                </a>
                <a
                  href={whatsappHref(headerPhone)}
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
          <button
            type="button"
            onClick={closeLead}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {showSpinner && (
            <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {!showSpinner && !lead && !brief && !placeholder && (
            <p className="py-12 text-center text-sm text-[var(--text-muted)]">
              {loadError ?? "Cannot load this job"}
            </p>
          )}
          {hideStages && brief && (
            <div className="space-y-4">
              <CrewJobBriefCards brief={brief} />
              <CrewInstallWorkspace
                lead={leadFromBrief(brief)}
                canUpload={canUploadInstall}
                onDone={() => void refresh(brief.id)}
                jobOpen={brief.jobOpen}
                canRemoveProofs={false}
              />
            </div>
          )}
          {hideStages && !brief && placeholder && briefLoading && (
            <div className="flex items-center justify-center py-12 text-[var(--text-muted)]">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {!hideStages && lead && (
            <InstallationPanel
              lead={lead}
              embedded
              onDone={() => void refresh(lead.id)}
              canAssign={canAssignInstall && !shellPaint}
              canUpload={canUploadInstall && !shellPaint}
              canComplete={canCompleteInstall && !shellPaint}
              hideStages={hideStages}
            />
          )}
        </div>
      </div>
    </div>
  );
}
