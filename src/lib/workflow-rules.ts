import type { SalesStage } from "@/lib/domain/workflow";
import { SALES_STAGE_ORDER } from "@/lib/domain/workflow";

export interface MoveSalesStageResult {
  allowed: boolean;
  reason?: string;
}

/** When sales activity is logged on a new lead, auto-advance to contacted. */
export function mergeAutoContactedStage(
  currentStage: SalesStage | string | undefined,
  updates: Record<string, unknown>
): boolean {
  if (currentStage === "new_lead") {
    updates.sales_stage = "contacted";
    return true;
  }
  return false;
}

/**
 * Stage moves that require conduct_survey (surveyor lane).
 * Tele-callers must not enter these stages.
 */
export function stageRequiresSurveyAuthority(stage: SalesStage): boolean {
  return stage === "survey_in_progress" || stage === "survey_completed";
}

/** Schedule visit / visit_scheduled requires schedule_site_visit. */
export function stageRequiresScheduleAuthority(stage: SalesStage): boolean {
  return stage === "visit_scheduled";
}

export function stageRequiresQuoteAuthority(stage: SalesStage): boolean {
  return stage === "quoted" || stage === "quote_accepted";
}

export function stageRequiresPaymentAuthority(stage: SalesStage): boolean {
  return (
    stage === "token_pending_verification" ||
    stage === "token_verified_and_feasibility_ok" ||
    stage === "pre_dispatch_pending_verification" ||
    stage === "pre_dispatch_verified" ||
    stage === "final_pending_verification" ||
    stage === "final_verified"
  );
}

export function stageRequiresInstallAuthority(stage: SalesStage): boolean {
  return (
    stage === "installation_assigned" ||
    stage === "installation_in_progress" ||
    stage === "installation_completed"
  );
}

export function stageRequiresLiaisonAuthority(stage: SalesStage): boolean {
  return (
    stage === "liaison_in_progress" ||
    stage === "meter_installed" ||
    stage === "subsidy_pending" ||
    stage === "subsidy_received_pending_accounts" ||
    stage === "completed"
  );
}

/** Pipeline drag/drop — forward freely; backward only when allowed (managers). */
export function canMoveSalesStage(
  current: SalesStage,
  next: SalesStage,
  allowBackward: boolean,
  opts?: {
    canScheduleVisit?: boolean;
    canConductSurvey?: boolean;
    canCreateQuotations?: boolean;
  }
): MoveSalesStageResult {
  if (current === next) return { allowed: false };

  if (current === "lost") {
    return { allowed: false, reason: "Reopen lost leads from the lead detail view" };
  }

  if (next === "lost") {
    return { allowed: false, reason: "Mark leads as lost from the lead detail view" };
  }

  const currentIdx = SALES_STAGE_ORDER.indexOf(current);
  const nextIdx = SALES_STAGE_ORDER.indexOf(next);
  if (currentIdx === -1 || nextIdx === -1) return { allowed: false };

  if (nextIdx < currentIdx && !allowBackward) {
    return { allowed: false, reason: "Only managers can move stages backwards" };
  }

  if (stageRequiresScheduleAuthority(next) && opts?.canScheduleVisit === false) {
    return {
      allowed: false,
      reason: "Only tele-callers / managers can schedule site visits",
    };
  }

  if (stageRequiresSurveyAuthority(next) && opts?.canConductSurvey === false) {
    return {
      allowed: false,
      reason: "Only surveyors / managers can advance into survey stages",
    };
  }

  if (stageRequiresQuoteAuthority(next) && opts?.canCreateQuotations === false) {
    return {
      allowed: false,
      reason: "Advance to quoted / accepted via the quotation builder",
    };
  }

  if (stageRequiresPaymentAuthority(next)) {
    return {
      allowed: false,
      reason: "Advance payment stages via Payments / Feasibility actions",
    };
  }

  if (stageRequiresInstallAuthority(next)) {
    return {
      allowed: false,
      reason: "Advance installation stages via the Installation workspace",
    };
  }

  if (stageRequiresLiaisonAuthority(next)) {
    return {
      allowed: false,
      reason: "Advance Discom / subsidy stages via Liaison or Customer Portal",
    };
  }

  // Surveyors should not pull leads back into pure tele-call stages via drag
  if (
    opts?.canConductSurvey &&
    !opts?.canScheduleVisit &&
    !allowBackward &&
    (next === "new_lead" || next === "contacted")
  ) {
    return {
      allowed: false,
      reason: "Surveyors cannot move leads back to the tele-call queue",
    };
  }

  return { allowed: true };
}

export function getNextSalesStage(current: SalesStage): SalesStage | null {
  const idx = SALES_STAGE_ORDER.indexOf(current);
  if (idx === -1 || idx >= SALES_STAGE_ORDER.length - 1) return null;
  return SALES_STAGE_ORDER[idx + 1];
}

/**
 * Stages that cannot be set via the generic moveSalesStage / stepper click.
 * Advance through Payments, Quotation, Survey, Installation, Liaison, Portal,
 * or the Survey Done "Move to Won" action (`markLeadWon`).
 */
export function requiresSpecializedAdvance(stage: SalesStage): boolean {
  return (
    stage === "visit_scheduled" ||
    stage === "survey_completed" ||
    stageRequiresQuoteAuthority(stage) ||
    stageRequiresPaymentAuthority(stage) ||
    stageRequiresInstallAuthority(stage) ||
    stageRequiresLiaisonAuthority(stage)
  );
}
