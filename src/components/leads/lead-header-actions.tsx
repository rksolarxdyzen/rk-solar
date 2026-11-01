"use client";

import { BookSurveyPanel } from "@/components/leads/book-survey-panel";
import {
  QuotePlaceholderCard,
  SurveyCompletePanel,
} from "@/components/leads/survey-complete-panel";
import type { LeadWithRelations } from "@/lib/domain/types";

export function LeadHeaderActions({
  lead,
  onDone,
  canScheduleVisit = true,
  canConductSurvey = true,
  canCreateQuotations = false,
}: {
  lead: LeadWithRelations;
  onDone: () => void;
  canScheduleVisit?: boolean;
  canConductSurvey?: boolean;
  canCreateQuotations?: boolean;
}) {
  const canBookVisit =
    canScheduleVisit &&
    (lead.sales_stage === "new_lead" ||
      lead.sales_stage === "contacted" ||
      lead.sales_stage === "visit_scheduled");

  // Visible to anyone who can open the lead (not only conduct_survey / admin).
  const showSurveyForm =
    lead.sales_stage === "new_lead" ||
    lead.sales_stage === "contacted" ||
    lead.sales_stage === "visit_scheduled" ||
    lead.sales_stage === "survey_in_progress" ||
    lead.sales_stage === "survey_completed";

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {canBookVisit && (
        <BookSurveyPanel
          lead={lead}
          onDone={onDone}
          mode={lead.sales_stage === "visit_scheduled" ? "reschedule" : "book"}
          variant="header"
        />
      )}
      {showSurveyForm && (
        <SurveyCompletePanel
          lead={lead}
          onDone={onDone}
          canConductSurvey
          variant="header"
        />
      )}
      <QuotePlaceholderCard lead={lead} canCreate={canCreateQuotations} variant="header" />
    </div>
  );
}
