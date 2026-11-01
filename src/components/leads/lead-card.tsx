"use client";

import { Badge } from "@/components/ui/badge";
import { MoveToWonButton } from "@/components/leads/move-to-won-button";
import { SALES_STAGE_LABELS, TEMPERATURE_LABELS } from "@/lib/domain/workflow";
import { formatAgeShort, formatDateTime, formatPhone, cn } from "@/lib/utils";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { usePrefetchLeadDetail } from "@/lib/leads/use-prefetch-lead-detail";
import type { LeadListShell } from "@/lib/leads/lead-shell";
import type { LeadTemperature, SalesStage } from "@/lib/domain/workflow";

interface LeadCardProps {
  id: string;
  name: string;
  phone: string;
  sales_stage: SalesStage;
  temperature?: LeadTemperature;
  assigned_name?: string | null;
  showStageBadge?: boolean;
  city?: string | null;
  address?: string | null;
  requirement_notes?: string | null;
  source?: string | null;
  created_at?: string | null;
  next_followup_at?: string | null;
  loss_reason?: string | null;
  telecaller_name?: string | null;
  surveyor_name?: string | null;
  assigned_profile?: { name: string } | null;
  showMoveToWon?: boolean;
  onWon?: () => void;
}

function toShell(props: LeadCardProps): LeadListShell {
  return {
    id: props.id,
    name: props.name,
    phone: props.phone,
    sales_stage: props.sales_stage,
    temperature: props.temperature,
    city: props.city,
    address: props.address,
    requirement_notes: props.requirement_notes,
    source: props.source,
    created_at: props.created_at,
    next_followup_at: props.next_followup_at,
    loss_reason: props.loss_reason,
    telecaller_name: props.telecaller_name,
    surveyor_name: props.surveyor_name,
    assigned_profile: props.assigned_profile ?? undefined,
  };
}

export function LeadCard(props: LeadCardProps) {
  const {
    id,
    name,
    phone,
    sales_stage,
    temperature = "warm",
    assigned_name,
    showStageBadge = true,
    city,
    created_at,
    next_followup_at,
    showMoveToWon = false,
    onWon,
  } = props;
  const { openLead } = useLeadModal();
  const prefetchLead = usePrefetchLeadDetail();
  const ageShort = created_at ? formatAgeShort(created_at) : null;
  const exactWhen = created_at ? formatDateTime(created_at) : null;
  const ageMs = created_at ? Date.now() - new Date(created_at).getTime() : 0;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const isStale =
    Boolean(created_at) &&
    ageDays >= 3 &&
    (sales_stage === "new_lead" || sales_stage === "contacted");
  const canMoveToWon =
    showMoveToWon &&
    (sales_stage === "survey_completed" || sales_stage === "quoted");

  const shell = toShell(props);

  return (
    <div className="relative rounded-lg border-[1.5px] border-[var(--border)] bg-white transition hover:-translate-y-px hover:border-[var(--primary)] hover:shadow-[var(--shadow)]">
      <button
        type="button"
        data-lead-id={id}
        onMouseEnter={() => prefetchLead(id)}
        onFocus={() => prefetchLead(id)}
        onPointerDown={() => prefetchLead(id)}
        onClick={() => openLead(id, shell)}
        className={cn(
          "block w-full p-3 text-left",
          canMoveToWon ? "pb-3" : "pb-7"
        )}
      >
        <p className="truncate text-sm font-semibold text-[var(--text-dark)]">{name}</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)] tabular-nums">{formatPhone(phone)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant={temperature}>{TEMPERATURE_LABELS[temperature]}</Badge>
          {showStageBadge && (
            <Badge variant={sales_stage}>{SALES_STAGE_LABELS[sales_stage]}</Badge>
          )}
        </div>
        {city && <p className="mt-1.5 truncate text-[0.7rem] text-[var(--text-muted)]">{city}</p>}
        {next_followup_at && (
          <p className="mt-1 text-[0.7rem] text-[var(--text-light)]">
            Follow-up:{" "}
            {new Date(next_followup_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        )}
        {assigned_name && (
          <p
            className={cn(
              "mt-1 truncate text-[0.7rem] text-[var(--text-muted)]",
              !canMoveToWon && "pr-8"
            )}
          >
            {assigned_name}
          </p>
        )}
      </button>
      {canMoveToWon && (
        <div className="px-3 pb-7">
          <MoveToWonButton leadId={id} leadName={name} variant="card" onWon={onWon} />
        </div>
      )}
      {ageShort && (
        <span
          className={cn(
            "absolute bottom-2 right-2.5 text-[0.65rem] font-semibold tabular-nums",
            isStale ? "text-[var(--warn)]" : "text-[var(--text-muted)]"
          )}
          title={exactWhen ?? undefined}
        >
          {ageShort}
        </span>
      )}
    </div>
  );
}
