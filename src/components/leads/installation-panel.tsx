"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { CrewInstallWorkspace } from "@/components/leads/crew-install-workspace";
import { CrewJobBriefCards } from "@/components/leads/crew-job-brief";
import {
  assignInstallationCrew,
  listCrewMembers,
} from "@/actions/installation";
import { getSurveySitePhotos } from "@/actions/surveys";
import { crewBriefFromLead } from "@/lib/domain/installation";
import type { LeadWithRelations } from "@/lib/domain/types";
import type { SurveyPhotoKey } from "@/lib/domain/survey-photos";
import { cn } from "@/lib/utils";
import { ROLE_LABELS } from "@/lib/brand";

export function InstallationPanel({
  lead,
  onDone,
  canAssign = false,
  canUpload = false,
  canComplete: _canComplete = false,
  embedded = false,
  hideStages = false,
}: {
  lead: LeadWithRelations;
  onDone: () => void;
  canAssign?: boolean;
  canUpload?: boolean;
  canComplete?: boolean;
  embedded?: boolean;
  hideStages?: boolean;
}) {
  const [crew, setCrew] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [crewId, setCrewId] = useState(lead.assigned_crew_id ?? "");
  const [panelCount, setPanelCount] = useState(
    String(lead.expected_panel_count ?? lead.won_panel_quantity ?? "")
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [surveyPhotos, setSurveyPhotos] = useState<
    Partial<Record<SurveyPhotoKey, string>>
  >({});
  const [surveyPhotoError, setSurveyPhotoError] = useState<string | null>(null);

  const stages = [
    "pre_dispatch_verified",
    "installation_assigned",
    "installation_in_progress",
    "installation_completed",
  ];
  const visible = stages.includes(lead.sales_stage) || Boolean(lead.installation_completed_at);
  const waitingForAssign =
    lead.sales_stage === "pre_dispatch_verified" && !lead.assigned_crew_id;
  const assigned =
    Boolean(lead.assigned_crew_id) &&
    (lead.sales_stage === "installation_assigned" ||
      lead.sales_stage === "installation_in_progress" ||
      lead.sales_stage === "installation_completed" ||
      Boolean(lead.installation_completed_at));

  useEffect(() => {
    if (!canAssign) return;
    void listCrewMembers()
      .then((rows) => setCrew(rows))
      .catch(() => setCrew([]));
  }, [canAssign, lead.id]);

  useEffect(() => {
    setSurveyPhotoError(null);
    void getSurveySitePhotos(lead.id)
      .then((urls) => setSurveyPhotos(urls))
      .catch(() => {
        setSurveyPhotos({});
        setSurveyPhotoError("Survey photos could not be loaded.");
      });
  }, [lead.id]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "space-y-4",
        !embedded && "rounded-xl border border-[var(--border)] bg-white p-4"
      )}
    >
      {!hideStages && !embedded && (
        <h3 className="font-semibold text-[var(--text-dark)]">Installation</h3>
      )}
      <CrewJobBriefCards
        brief={crewBriefFromLead(lead, surveyPhotos, surveyPhotoError)}
      />
      {hideStages ? (
        <p className="text-xs text-[var(--text-muted)]">
          {waitingForAssign
            ? "This job is not assigned to you."
            : "Capture the required photos and video. Saved files stay if you leave mid-job."}
        </p>
      ) : (
        <p className="text-xs text-[var(--text-muted)]">
          {waitingForAssign
            ? "Finalized — awaiting Installation Supervisor assignment."
            : "Assign crew and panel count. Crew uploads proofs; the job moves to Documentation when all required items are in."}
        </p>
      )}

      {canAssign && lead.sales_stage !== "installation_completed" && !lead.installation_completed_at && (
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setOkMsg(null);
            startTransition(async () => {
              try {
                await assignInstallationCrew({
                  leadId: lead.id,
                  crewId,
                  expectedPanelCount: panelCount ? Number(panelCount) : null,
                });
                setOkMsg("Crew assigned");
                onDone();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed");
              }
            });
          }}
        >
          <div className="sm:col-span-2">
            <Label>Installation crew</Label>
            <select
              className="w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm"
              required
              value={crewId}
              onChange={(e) => setCrewId(e.target.value)}
            >
              <option value="">Select…</option>
              {crew.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({ROLE_LABELS[c.role as keyof typeof ROLE_LABELS] ?? c.role})
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Number of panels</Label>
            <Input
              type="number"
              min={1}
              value={panelCount}
              onChange={(e) => setPanelCount(e.target.value)}
              placeholder="e.g. 10"
            />
          </div>
          <div className="sm:col-span-3">
            <Button type="submit" size="sm" disabled={pending || !crewId}>
              {pending ? "Saving…" : lead.assigned_crew_id ? "Reassign crew" : "Assign crew"}
            </Button>
          </div>
        </form>
      )}

      {!canAssign && waitingForAssign && (
        <p className="rounded-lg bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-muted)]">
          {hideStages ? "This job is not assigned to you." : "Waiting for Supervisor assignment"}
        </p>
      )}

      {assigned && canUpload && (
        <CrewInstallWorkspace
          lead={lead}
          canUpload={canUpload}
          onDone={onDone}
          canRemoveProofs={canAssign}
        />
      )}

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {okMsg && <p className="text-sm text-[var(--success)]">{okMsg}</p>}
    </div>
  );
}
