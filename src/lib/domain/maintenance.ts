export const CLEANING_INTERVAL_DAYS = 15;
export const SERVICE_OFFER_ENGINEER_LIMIT = 3;

export const TICKET_STATUSES = [
  "raised",
  "accepted",
  "in_progress",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  raised: "Raised",
  accepted: "Accepted",
  in_progress: "In progress",
  closed: "Closed",
};

export const OFFER_STATUSES = [
  "offered",
  "accepted",
  "rejected",
  "expired",
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

export function computeCleaningDueAt(from: Date = new Date()) {
  const due = new Date(from.getTime());
  due.setDate(due.getDate() + CLEANING_INTERVAL_DAYS);
  return due;
}

export function isCleaningDue(input: {
  cleaning_next_due_at?: string | null;
  now?: Date;
}) {
  if (!input.cleaning_next_due_at) return false;
  const due = new Date(input.cleaning_next_due_at).getTime();
  if (Number.isNaN(due)) return false;
  return (input.now ?? new Date()).getTime() >= due;
}

export type ServiceTicket = {
  id: string;
  company_id: string;
  lead_id: string;
  status: TicketStatus;
  description: string;
  assigned_to: string | null;
  raised_via: "portal" | "staff";
  accepted_at: string | null;
  started_at: string | null;
  closed_at: string | null;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ServiceTicketOffer = {
  id: string;
  ticket_id: string;
  engineer_id: string;
  status: OfferStatus;
  responded_at: string | null;
};

export type ServiceTicketPhoto = {
  id: string;
  ticket_id: string;
  file_url: string;
  caption: string | null;
  created_at: string;
};
