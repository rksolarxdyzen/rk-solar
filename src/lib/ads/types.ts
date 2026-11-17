export const AD_SUBMISSION_STATUSES = ["new", "contacted", "junk"] as const;
export type AdSubmissionStatus = (typeof AD_SUBMISSION_STATUSES)[number];

export const CAPACITY_INTERESTS = [
  { value: "", label: "Not sure yet" },
  { value: "1-3kw", label: "1–3 kW (small home)" },
  { value: "3-5kw", label: "3–5 kW" },
  { value: "5kw+", label: "5 kW+" },
] as const;

export type AdCampaignSubmission = {
  id: string;
  company_id: string;
  created_at: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  capacity_interest: string | null;
  message: string | null;
  status: AdSubmissionStatus;
  campaign: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  gclid: string | null;
  fbclid: string | null;
  landing_path: string;
  user_agent: string | null;
  ip_hash: string | null;
  contacted_at: string | null;
  notes: string | null;
};

export type AdSubmitInput = {
  name: string;
  phone: string;
  email?: string;
  city?: string;
  capacityInterest?: string;
  message?: string;
  website?: string; // honeypot
  campaign?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  fbclid?: string;
  landingPath?: string;
  userAgent?: string;
  ipHash?: string;
};
