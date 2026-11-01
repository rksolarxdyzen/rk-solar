"use client";

import { useEffect, useState, useTransition } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { getLeadReassignmentOptions, reassignLead } from "@/actions/leads";
import type { LeadWithRelations } from "@/lib/domain/types";

export function LeadReassignPanel({
  lead,
  onDone,
}: {
  lead: LeadWithRelations;
  onDone: () => void;
}) {
  const [canReassign, setCanReassign] = useState(false);
  const [telecallers, setTelecallers] = useState<Array<{ id: string; name: string }>>([]);
  const [surveyors, setSurveyors] = useState<Array<{ id: string; name: string }>>([]);
  const [telecallerId, setTelecallerId] = useState(lead.assigned_telecaller_id ?? "");
  const [surveyorId, setSurveyorId] = useState(lead.assigned_surveyor_id ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLeadReassignmentOptions()
      .then((opts) => {
        setCanReassign(opts.canReassign);
        setTelecallers(opts.telecallers);
        setSurveyors(opts.surveyors);
        setTelecallerId(lead.assigned_telecaller_id ?? "");
        setSurveyorId(lead.assigned_surveyor_id ?? "");
      })
      .catch(() => setCanReassign(false));
  }, [lead.assigned_telecaller_id, lead.assigned_surveyor_id]);

  if (!canReassign) return null;

  const unchanged =
    telecallerId === (lead.assigned_telecaller_id ?? "") &&
    surveyorId === (lead.assigned_surveyor_id ?? "");

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="flex items-center gap-2">
        <UserRound className="h-4 w-4 text-[var(--primary)]" />
        <h3 className="text-sm font-semibold text-[var(--text-dark)]">Reassign roles</h3>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Tele-caller: {lead.telecaller_profile?.name ?? lead.assigned_profile?.name ?? "—"} ·
        Surveyor: {lead.surveyor_profile?.name ?? "—"}
      </p>
      <div>
        <Label>Tele-caller</Label>
        <Select value={telecallerId} onChange={(e) => setTelecallerId(e.target.value)}>
          <option value="">Unassigned</option>
          {telecallers.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Field surveyor</Label>
        <Select value={surveyorId} onChange={(e) => setSurveyorId(e.target.value)}>
          <option value="">Unassigned</option>
          {surveyors.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </div>
      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      <Button
        type="button"
        size="sm"
        disabled={pending || unchanged}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              await reassignLead(lead.id, {
                telecallerId: telecallerId || null,
                surveyorId: surveyorId || null,
              });
              onDone();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Reassign failed");
            }
          });
        }}
      >
        {pending ? "Saving…" : "Save assignments"}
      </Button>
    </div>
  );
}
