"use client";

import { useEffect, useState } from "react";
import { ACTIVITY_TYPE_LABELS, CALL_OUTCOME_LABELS } from "@/lib/domain/sales";
import { getLeadActivities } from "@/actions/sales";
import { formatDateTime } from "@/lib/utils";
import type { LeadWithRelations } from "@/lib/domain/types";

interface ActivityRow {
  id: string;
  outcome: string;
  notes: string | null;
  created_at: string;
  user?: { name: string } | null;
}

export function LeadActivityPanel({
  lead,
}: {
  lead: LeadWithRelations;
  onDone?: () => void;
}) {
  const [rows, setRows] = useState<ActivityRow[]>([]);

  async function load() {
    const data = await getLeadActivities(lead.id);
    setRows(data as ActivityRow[]);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        History
      </h4>
      {rows.length === 0 && (
        <p className="text-sm text-[var(--text-muted)]">No activity yet</p>
      )}
      {rows.map((row) => (
        <div
          key={row.id}
          className="rounded-lg border border-[var(--border-light)] px-3 py-2 text-sm"
        >
          <div className="flex justify-between gap-2">
            <span className="font-medium text-[var(--text-dark)]">
                {CALL_OUTCOME_LABELS[row.outcome] ??
                  ACTIVITY_TYPE_LABELS[row.outcome] ??
                  row.outcome}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {formatDateTime(row.created_at)}
            </span>
          </div>
          {row.notes && <p className="mt-1 text-[var(--text-body)]">{row.notes}</p>}
          {row.user?.name && (
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{row.user.name}</p>
          )}
        </div>
      ))}
    </div>
  );
}
