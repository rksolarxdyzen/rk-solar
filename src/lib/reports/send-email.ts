/**
 * Email delivery for daily reports.
 * Prefers Resend REST API when RESEND_API_KEY is set.
 */

export type SendEmailInput = {
  to: string[];
  subject: string;
  html: string;
};

export type SendEmailResult =
  | { ok: true; provider: "resend"; id?: string }
  | { ok: true; provider: "log"; id?: string }
  | { ok: false; error: string };

function parseRecipients(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    ),
  ];
}

/** Merge env DAILY_REPORT_TO with per-company emails. */
export function resolveReportRecipients(companyEmails?: string | null): string[] {
  const fromEnv = parseRecipients(process.env.DAILY_REPORT_TO);
  const fromCompany = parseRecipients(companyEmails);
  return [...new Set([...fromEnv, ...fromCompany])];
}

export async function sendReportEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const to = input.to.filter(Boolean);
  if (to.length === 0) {
    return { ok: false, error: "No recipients configured (DAILY_REPORT_TO / companies.daily_report_emails)" };
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.DAILY_REPORT_FROM?.trim() ||
    process.env.RESEND_FROM?.trim() ||
    "RK Reports <onboarding@resend.dev>";

  if (!apiKey) {
    console.info(
      "[daily-report] RESEND_API_KEY unset — logging email instead of sending.",
      { to, subject: input.subject, htmlBytes: input.html.length }
    );
    return { ok: true, provider: "log" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: input.subject,
        html: input.html,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      return {
        ok: false,
        error: body.message || `Resend HTTP ${res.status}`,
      };
    }
    return { ok: true, provider: "resend", id: body.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Email send failed",
    };
  }
}
