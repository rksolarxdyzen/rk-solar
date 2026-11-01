"use client";

import { HardHat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { usePrefetchLeadDetail } from "@/lib/leads/use-prefetch-lead-detail";
import { useVisibleLeadPrefetch } from "@/lib/leads/use-visible-lead-prefetch";
import type { LeadListShell } from "@/lib/leads/lead-shell";
import { SALES_STAGE_LABELS, type SalesStage } from "@/lib/domain/workflow";
import { formatDateTime, formatPhone } from "@/lib/utils";

export type InstallationQueueRow = {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  sales_stage: string;
  expected_panel_count: number | null;
  installation_assigned_at: string | null;
  assigned_crew_id: string | null;
  crewName: string | null;
};

function rowShell(row: InstallationQueueRow): LeadListShell {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    sales_stage: row.sales_stage as SalesStage,
    city: row.city,
    expected_panel_count: row.expected_panel_count,
  };
}

function Cards({
  rows,
  hideStages = false,
}: {
  rows: InstallationQueueRow[];
  hideStages?: boolean;
}) {
  const { openInstallation } = useLeadModal();
  const prefetchLead = usePrefetchLeadDetail();

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => {
        const shell = rowShell(row);
        return (
          <button
            key={row.id}
            type="button"
            data-lead-id={row.id}
            onMouseEnter={() => prefetchLead(row.id)}
            onFocus={() => prefetchLead(row.id)}
            onPointerDown={() => prefetchLead(row.id)}
            onClick={() => openInstallation(row.id, shell)}
            className="rounded-2xl border border-[var(--border)] bg-white p-4 text-left shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--info)]/40 hover:shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--text-dark)]">{row.name}</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {formatPhone(row.phone)}
                  {row.city ? ` · ${row.city}` : ""}
                </p>
              </div>
              {!hideStages && (
                <Badge variant={row.sales_stage}>
                  {SALES_STAGE_LABELS[row.sales_stage as SalesStage] ?? row.sales_stage}
                </Badge>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
              <span>Panels: {row.expected_panel_count ?? "—"}</span>
              {!hideStages && <span>Crew: {row.crewName ?? "Unassigned"}</span>}
              <span>{formatDateTime(row.installation_assigned_at)}</span>
            </div>
            <p className="mt-3 text-xs font-semibold text-[var(--info)]">Open job →</p>
          </button>
        );
      })}
    </div>
  );
}

export function InstallationQueueList({
  rows,
  crewView = false,
}: {
  rows: InstallationQueueRow[];
  crewView?: boolean;
}) {
  const prefetchRootRef = useVisibleLeadPrefetch(rows.length);
  const awaiting = rows.filter(
    (r) => r.sales_stage === "pre_dispatch_verified" && !r.assigned_crew_id
  );
  const assigned = rows.filter(
    (r) => !(r.sales_stage === "pre_dispatch_verified" && !r.assigned_crew_id)
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-6 py-16 text-center">
        <HardHat className="mx-auto h-8 w-8 text-[var(--text-light)]" />
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          {crewView
            ? "No jobs assigned to you yet."
            : "No installation jobs yet. Complete pre-dispatch verification first."}
        </p>
      </div>
    );
  }

  return (
    <div ref={prefetchRootRef} className="space-y-8">
      {!crewView && awaiting.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-dark)]">
              Awaiting assignment
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Finalized after pre-dispatch — Installation Supervisor assigns crew.
            </p>
          </div>
          <Cards rows={awaiting} hideStages={crewView} />
        </section>
      )}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-dark)]">
            {crewView ? "My jobs" : "Assigned / in progress"}
          </h2>
          {crewView && (
            <p className="text-xs text-[var(--text-muted)]">
              Finish remaining photos whenever you can. Uploaded files stay on the job.
            </p>
          )}
        </div>
        {assigned.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            {crewView ? "No jobs assigned to you yet." : "No assigned jobs yet."}
          </p>
        ) : (
          <Cards rows={assigned} hideStages={crewView} />
        )}
      </section>
    </div>
  );
}
