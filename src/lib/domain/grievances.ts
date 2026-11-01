export const GRIEVANCE_STATUSES = [
  "open",
  "in_progress",
  "escalated",
  "resolved",
] as const;
export type GrievanceStatus = (typeof GRIEVANCE_STATUSES)[number];

export const GRIEVANCE_STATUS_LABELS: Record<GrievanceStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  escalated: "Escalated",
  resolved: "Resolved",
};

/** Open for dashboard Outstanding Tasks (not resolved). */
export const OPEN_GRIEVANCE_STATUSES: GrievanceStatus[] = [
  "open",
  "in_progress",
  "escalated",
];

export const GRIEVANCE_CATEGORIES = [
  "hr",
  "operations",
  "payroll",
  "facilities",
  "it",
  "compliance",
  "meter_install",
  "other",
] as const;
export type GrievanceCategory = (typeof GRIEVANCE_CATEGORIES)[number];

export const GRIEVANCE_CATEGORY_LABELS: Record<GrievanceCategory, string> = {
  hr: "HR",
  operations: "Operations",
  payroll: "Payroll",
  facilities: "Facilities",
  it: "IT / Systems",
  compliance: "Compliance",
  meter_install: "Meter Install",
  other: "Other",
};

export const GRIEVANCE_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type GrievancePriority = (typeof GRIEVANCE_PRIORITIES)[number];

export const GRIEVANCE_PRIORITY_LABELS: Record<GrievancePriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export type Grievance = {
  id: string;
  company_id: string;
  title: string;
  description: string;
  category: GrievanceCategory;
  priority: GrievancePriority;
  status: GrievanceStatus;
  raised_by: string;
  assigned_to: string | null;
  resolution_notes: string | null;
  escalated_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type GrievanceAttachment = {
  id: string;
  grievance_id: string;
  file_url: string;
  caption: string | null;
  created_at: string;
};
