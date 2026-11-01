import { Suspense } from "react";
import { redirect } from "next/navigation";
import { listLeads, listPovUsers } from "@/actions/leads";
import { PipelineBoard, type PipelineLead } from "@/components/leads/pipeline-board";
import { NewLeadButton } from "@/components/leads/new-lead-button";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUser, hasAuthority } from "@/lib/auth";
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

function parseQueue(
  raw: string | undefined,
  fallback: PipelineQueue
): PipelineQueue {
  if (raw === "tele_call" || raw === "site_visits" || raw === "all") return raw;
  return fallback;
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    queue?: string;
    as?: string;
    as_role?: string;
  }>;
}) {
  const profile = await getCurrentUser();
  if (!profile?.is_active) redirect("/login");

  const sp = await searchParams;
  const leadStatus = sp.status === "lost" ? "lost" : "active";
  const isManagerRole =
    profile.role === "admin" || profile.role === "sales_manager";
  const canReassign = await hasAuthority(profile.id, "reassign_leads");
  const canMoveBackward = isManagerRole || canReassign;
  const canScheduleVisit =
    isManagerRole || (await hasAuthority(profile.id, "schedule_site_visit"));
  const canConductSurvey =
    isManagerRole || (await hasAuthority(profile.id, "conduct_survey"));
  const canMarkWon =
    isManagerRole || (await hasAuthority(profile.id, "move_lead_stage"));

  let povUsers: Awaited<ReturnType<typeof listPovUsers>> = [];
  let activeLeads: Awaited<ReturnType<typeof listLeads>> = [];
  let lostLeads: Awaited<ReturnType<typeof listLeads>> = [];

  try {
    povUsers = await listPovUsers();
    const viewAs =
      povUsers.length > 0 ? parsePipelinePov(sp.as, sp.as_role) : null;
    const queue = viewAs
      ? "all"
      : parseQueue(sp.queue, defaultPipelineQueue(profile));

    [activeLeads, lostLeads] = await Promise.all([
      listLeads({ status: "active", queue, viewAs }),
      listLeads({ status: "lost", queue, viewAs }),
    ]);

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

    const activeMapped = activeLeads
      .filter((lead) => isPipelineSalesStage(lead.sales_stage))
      .map(mapLead);
    const lostMapped = lostLeads.map(mapLead);
    const pipelineLeads = leadStatus === "lost" ? lostMapped : activeMapped;

    const queueLabel =
      povSubtitle(viewAs, povUsers) ??
      (queue === "tele_call"
        ? "My tele-call queue"
        : queue === "site_visits"
          ? "My site visits"
          : "All visible leads");

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
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load pipeline";
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Leads"
          title="Pipeline board"
          subtitle="Could not load leads for this view."
          actions={<NewLeadButton />}
          className="mb-0"
        />
        <p className="rounded-xl border border-[var(--error)]/30 bg-white p-4 text-sm text-[var(--error)]">
          {message}
        </p>
      </div>
    );
  }
}
