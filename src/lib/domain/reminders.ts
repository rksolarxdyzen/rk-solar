export const REMINDER_TYPE_LABELS: Record<string, string> = {
  sales_followup: "Sales Follow-up",
  post_survey_followup: "Post-Survey Follow-up",
  survey_scheduled: "Site Visit",
  payment_verification: "Payment Verification",
};

const POST_SURVEY_STAGES = new Set(["survey_completed"]);

export function isPostSurveyStage(stage: string | null | undefined): boolean {
  if (!stage) return false;
  return POST_SURVEY_STAGES.has(stage);
}

export function followupReminderTypeForStage(
  stage: string | null | undefined
): "sales_followup" | "post_survey_followup" {
  return isPostSurveyStage(stage) ? "post_survey_followup" : "sales_followup";
}

export type ReminderUrgency = "overdue" | "due_now" | "due_today" | "upcoming";

export interface ReminderItem {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  reminderType: string;
  message: string;
  dueAt: string;
  urgency: ReminderUrgency;
  assignedTo: string | null;
  salesStage?: string | null;
  kind?: "reminder" | "service" | "payment";
  resolvable?: boolean;
}

export interface ReminderSummary {
  overdue: number;
  dueNow: number;
  dueToday: number;
  upcoming: number;
  total: number;
  items: ReminderItem[];
  /** Viewer verifies payments and receives payment-request alerts. */
  paymentAlerts?: boolean;
}

export function getReminderDisplayLabel(item: ReminderItem): string {
  if (item.kind === "payment") {
    return REMINDER_TYPE_LABELS.payment_verification;
  }
  if (item.reminderType === "survey_scheduled") {
    return REMINDER_TYPE_LABELS.survey_scheduled;
  }
  if (item.reminderType === "post_survey_followup" || isPostSurveyStage(item.salesStage)) {
    return REMINDER_TYPE_LABELS.post_survey_followup;
  }
  if (item.reminderType === "sales_followup") {
    return REMINDER_TYPE_LABELS.sales_followup;
  }
  return REMINDER_TYPE_LABELS[item.reminderType] ?? item.reminderType;
}

export function summarizeReminders(items: ReminderItem[]): ReminderSummary {
  const overdue = items.filter((i) => i.urgency === "overdue").length;
  const dueNow = items.filter((i) => i.urgency === "due_now").length;
  const dueToday = items.filter((i) => i.urgency === "due_today").length;
  const upcoming = items.filter((i) => i.urgency === "upcoming").length;
  return {
    overdue,
    dueNow,
    dueToday,
    upcoming,
    total: items.length,
    items,
  };
}
