export const CALL_OUTCOMES = [
  { value: "connected", label: "Connected" },
  { value: "not_reachable", label: "Not Reachable" },
  { value: "not_pick", label: "Not pick" },
  { value: "busy", label: "Busy" },
  { value: "wrong_number", label: "Wrong Number" },
  { value: "switched_off", label: "Switched Off" },
  { value: "callback_requested", label: "Callback Requested" },
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number]["value"];

export const CALL_OUTCOME_LABELS: Record<string, string> = Object.fromEntries(
  CALL_OUTCOMES.map((o) => [o.value, o.label])
);

export const QUICK_CALL_ACTIONS = [
  { value: "busy", label: "Busy" },
  { value: "not_pick", label: "Not pick" },
] as const;

export const ACTIVITY_TYPES = [
  { value: "call", label: "Call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "visit", label: "Site Visit" },
  { value: "meeting", label: "Meeting" },
  { value: "email", label: "Email" },
] as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[number]["value"];

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  call: "Call",
  whatsapp: "WhatsApp",
  visit: "Site Visit",
  meeting: "Meeting",
  email: "Email",
  connected: "Call",
  not_reachable: "Call",
  not_pick: "Call",
  busy: "Call",
  wrong_number: "Call",
  switched_off: "Call",
  callback_requested: "Call",
};

export const FOLLOWUP_ACTIONS = [
  "Call Back",
  "Send Proposal",
  "Schedule Survey",
  "Share Quote",
  "Collect Documents",
  "Other",
] as const;

export const LOST_REASONS = [
  "Price / budget",
  "Chose competitor",
  "Not interested",
  "Not decision maker",
  "Site not suitable",
  "Timing / delay",
  "Duplicate lead",
  "Wrong number / unreachable",
  "Other",
] as const;
