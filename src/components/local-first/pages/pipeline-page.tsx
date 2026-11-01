"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { PipelineBoard, type PipelineLead } from "@/components/leads/pipeline-board";
import { NewLeadButton } from "@/components/leads/new-lead-button";
import { PageHeader } from "@/components/layout/page-header";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { hasAuth, roleIn } from "@/lib/local-first/access";
import { pipelineOptions } from "@/lib/local-first/queries";
import { loadListState, saveListState } from "@/lib/local-first/list-state";
import {
  defaultPipelineQueue,
  parsePipelinePov,
  povSubtitle,
  type PipelineQueue,
} from "@/lib/leads/visibility";
import {
  isPipelineSalesStage,
  type SalesStage,
  type LeadTemperature,
} from "@/lib/domain/workflow";

function parseQueue(raw: string | null, fallback: PipelineQueue): PipelineQueue {
  if (raw === "tele_call" || raw === "site_visits" || raw === "all") return raw;
  return fallback;
}

function PipelineInner() {
  const { profile, authorities, companyId } = useLocalFirstSession();
  const searchParams = useSearchParams();
  const leadStatus = searchParams.get("status") === "lost" ? "lost" : "active";
  const isManagerRole = roleIn(profile, ["admin", "sales_manager"]);
  const canReassign = hasAuth(authorities, "reassign_leads");
  const canMoveBackward = isManagerRole || canReassign;
  const canScheduleVisit =
    isManagerRole || hasAuth(authorities, "schedule_site_visit");
  const canConductSurvey =
    isManagerRole || hasAuth(authorities, "conduct_survey");
  const canMarkWon = isManagerRole || hasAuth(authorities, "move_lead_stage");

  const viewAsRaw = parsePipelinePov(
    searchParams.get("as") ?? undefined,
    searchParams.get("as_role") ?? undefined
  );
  const queueParam = searchParams.get("queue");

  const { data, isPending } = useQuery({
    ...pipelineOptions(companyId, {
      status: "active",
      queue: "all",
      viewAs: null,
    }),
  });

  const povUsers = data?.povUsers ?? [];
  const viewAs = povUsers.length > 0 ? viewAsRaw : null;
  const queue = viewAs
    ? "all"
    : parseQueue(queueParam, defaultPipelineQueue(profile));

  const scoped = useQuery({
    ...pipelineOptions(companyId, {
      status: "active",
      queue,
      viewAs,
    }),
    enabled: Boolean(data),
    placeholderData: data,
  });

  const activeLeads = scoped.data?.activeLeads ?? data?.activeLeads ?? [];
  const lostLeads = scoped.data?.lostLeads ?? data?.lostLeads ?? [];

  useEffect(() => {
    const saved = loadListState<{ search?: string }>("pipeline");
    if (saved?.search) {
      // PipelineBoard owns search; persist scroll/filter via session on unmount below
    }
  }, []);

  useEffect(() => {
    return () => {
      saveListState("pipeline", {
        queue,
        leadStatus,
        scrollY: typeof window !== "undefined" ? window.scrollY : 0,
      });
    };
  }, [queue, leadStatus]);

  function mapLead(l: (typeof activeLeads)[number]): PipelineLead {
    const tele = l.telecaller_profile;
    const surv = l.surveyor_profile;
    const assigned = l.assigned_profile;
    return {
      id: l.id,
      name: l.name,
      phone: l.phone,
      sales_stage: l.sales_stage as SalesStage,
      temperature: (l.temperature as LeadTemperature | undefined) ?? "warm",
      city: l.city,
      address: l.address,
      requirement_notes: l.requirement_notes,
      loss_reason: l.loss_reason ?? null,
      created_at: l.created_at ?? null,
      source: l.source ?? null,
      next_followup_at: l.next_followup_at ?? null,
      assigned_surveyor_id: l.assigned_surveyor_id ?? null,
      survey_date: l.survey_date ?? null,
      visit_scheduled_at: l.visit_scheduled_at ?? null,
      visit_notes: l.visit_notes ?? null,
      telecaller_name: tele?.name ?? assigned?.name ?? null,
      surveyor_name: surv?.name ?? null,
      assigned_profile: assigned ?? null,
    };
  }

  const activeMapped = useMemo(
    () =>
      activeLeads
        .filter((lead) => isPipelineSalesStage(lead.sales_stage))
        .map(mapLead),
    [activeLeads]
  );
  const lostMapped = useMemo(() => lostLeads.map(mapLead), [lostLeads]);
  const pipelineLeads = leadStatus === "lost" ? lostMapped : activeMapped;

  const queueLabel =
    povSubtitle(viewAs, povUsers) ??
    (queue === "tele_call"
      ? "My tele-call queue"
      : queue === "site_visits"
        ? "My site visits"
        : "All visible leads");

  if (isPending && !data) {
    return (
      <div className="min-h-[40vh]" aria-busy="true" aria-label="Loading pipeline" />
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Leads"
        title="Pipeline board"
        subtitle={
          leadStatus === "lost"
            ? "Lost leads — reopen from lead details"
            : `${queueLabel} — through Quoted; Won moves to Customers`
        }
        actions={<NewLeadButton />}
        className="mb-4"
      />
      <Suspense fallback={null}>
        <PipelineBoard
          leads={pipelineLeads}
          canMoveBackward={canMoveBackward}
          canScheduleVisit={canScheduleVisit}
          canConductSurvey={canConductSurvey}
          canMarkWon={canMarkWon}
          leadStatus={leadStatus}
          queue={queue}
          activeCount={activeMapped.length}
          lostCount={lostMapped.length}
          povUsers={povUsers}
          povActive={Boolean(viewAs)}
        />
      </Suspense>
    </div>
  );
}

export default function PipelinePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh]" aria-busy="true" aria-label="Loading pipeline" />
      }
    >
      <PipelineInner />
    </Suspense>
  );
}
