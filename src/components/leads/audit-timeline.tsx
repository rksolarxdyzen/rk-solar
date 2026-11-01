"use client";

import { useEffect, useState } from "react";
import { getLeadAuditEvents } from "@/lib/audit";
import { formatDateTime } from "@/lib/utils";

const EVENT_LABELS: Record<string, string> = {
  lead_created: "Lead created",
  lead_updated: "Lead updated",
  lead_reassigned: "Lead reassigned",
  stage_change: "Stage changed",
  call_logged: "Call / activity logged",
  followup_scheduled: "Follow-up scheduled",
  survey_scheduled: "Site visit scheduled",
  survey_completed: "Digital survey completed",
  lead_ingested: "Lead ingested (API)",
  quotation_created: "Quotation created",
  quotation_updated: "Quotation updated",
  quotation_accepted: "Quotation accepted",
  portal_created: "Customer portal created",
  payment_recorded: "Payment recorded",
  payment_verified: "Payment verified",
  payment_rejected: "Payment rejected",
  feasibility_submitted: "Feasibility submitted",
  feasibility_approved: "Feasibility approved",
  feasibility_rejected: "Feasibility rejected",
  installation_crew_assigned: "Installation crew assigned",
  installation_photo_added: "Installation proof added",
  installation_completed: "Installation completed",
  subsidy_timer_overdue: "Subsidy timer overdue",
  project_completed: "Project completed",
  service_ticket_raised: "Service ticket raised",
  service_ticket_accepted: "Service ticket accepted",
  service_ticket_force_assigned: "Service ticket force-assigned",
  service_ticket_closed: "Service ticket closed",
  cleaning_reminder: "Cleaning reminder queued",
  lead_lost: "Marked lost",
  lead_reopened: "Reopened",
  lead_imported: "Imported",
  lead_distributed: "Distributed",
  lead_deleted: "Deleted",
};

type AuditRow = {
  id: string;
  event_type: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: { name: string } | null;
};

export function AuditTimeline({ leadId }: { leadId: string }) {
  const [events, setEvents] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getLeadAuditEvents(leadId)
      .then((data) => {
        if (!cancelled) setEvents(data as AuditRow[]);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  if (loading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading audit…</p>;
  }

  if (events.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">No audit events yet</p>;
  }

  return (
    <ul className="space-y-3">
      {events.map((ev) => (
        <li
          key={ev.id}
          className="relative border-l-2 border-[var(--border)] pl-4 before:absolute before:-left-[5px] before:top-1.5 before:h-2 before:w-2 before:rounded-full before:bg-[var(--primary)]"
        >
          <p className="text-sm font-semibold text-[var(--text-dark)]">
            {EVENT_LABELS[ev.event_type] ?? ev.event_type}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {formatDateTime(ev.created_at)}
            {ev.actor?.name ? ` · ${ev.actor.name}` : ""}
          </p>
          {ev.metadata && Object.keys(ev.metadata).length > 0 && (
            <p className="mt-1 text-xs text-[var(--text-body)]">
              {ev.event_type === "stage_change" &&
              typeof ev.metadata.from === "string" &&
              typeof ev.metadata.to === "string"
                ? `${ev.metadata.from} → ${ev.metadata.to}`
                : null}
              {ev.event_type === "lead_reassigned" &&
              typeof ev.metadata.toName === "string"
                ? `To ${ev.metadata.toName}`
                : null}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
