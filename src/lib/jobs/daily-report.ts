import { createAdminClient } from "@/lib/supabase/admin";
import { istDayWindow } from "@/lib/reports/day-window";
import {
  collectDailyReportMetrics,
  summarizeMetricsForLog,
} from "@/lib/reports/daily-metrics";
import {
  buildDailyReportEmailHtml,
  buildDailyReportSubject,
} from "@/lib/reports/daily-email-html";
import { resolveReportRecipients, sendReportEmail } from "@/lib/reports/send-email";

export type DailyReportJobResult = {
  dateKey: string;
  companies: number;
  sent: number;
  skipped: number;
  failed: number;
  details: Array<{
    companyId: string;
    companyName: string;
    status: string;
    recipients?: string[];
    error?: string;
  }>;
};

/**
 * Evening daily + employee performance digest for every company.
 * Idempotent per (company, daily_evening, IST date) via report_runs.
 */
export async function runDailyReportJobs(opts?: {
  /** Force re-send even if a successful run exists for today */
  force?: boolean;
  companyId?: string;
}): Promise<DailyReportJobResult> {
  const admin = createAdminClient();
  const window = istDayWindow();
  const force = Boolean(opts?.force);

  let companiesQuery = admin.from("companies").select("id, name, daily_report_emails").order("name");
  if (opts?.companyId) {
    companiesQuery = companiesQuery.eq("id", opts.companyId);
  }

  let { data: companies, error: companiesError } = await companiesQuery;
  if (companiesError && /daily_report_emails|column .* does not exist/i.test(companiesError.message)) {
    let fallback = admin.from("companies").select("id, name").order("name");
    if (opts?.companyId) fallback = fallback.eq("id", opts.companyId);
    const retry = await fallback;
    if (retry.error) throw new Error(retry.error.message);
    companies = (retry.data ?? []).map((c) => ({ ...c, daily_report_emails: null }));
    companiesError = null;
  }
  if (companiesError) throw new Error(companiesError.message);

  const details: DailyReportJobResult["details"] = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const company of companies ?? []) {
    try {
      const { data: existing } = await admin
        .from("report_runs")
        .select("id, status")
        .eq("company_id", company.id)
        .eq("report_type", "daily_evening")
        .eq("report_date", window.dateKey)
        .maybeSingle();

      if (existing && (existing.status === "sent" || existing.status === "logged") && !force) {
        skipped += 1;
        details.push({
          companyId: company.id,
          companyName: company.name,
          status: "skipped_already_sent",
        });
        continue;
      }

      const recipients = resolveReportRecipients(company.daily_report_emails);
      const metrics = await collectDailyReportMetrics(
        admin,
        { id: company.id, name: company.name },
        window
      );
      const html = buildDailyReportEmailHtml(metrics);
      const subject = buildDailyReportSubject(metrics);

      const delivery = await sendReportEmail({ to: recipients, subject, html });

      if (!delivery.ok) {
        failed += 1;
        await upsertReportRun(admin, {
          companyId: company.id,
          dateKey: window.dateKey,
          status: "failed",
          recipients: recipients.join(","),
          metrics: summarizeMetricsForLog(metrics),
          error: delivery.error,
        });
        details.push({
          companyId: company.id,
          companyName: company.name,
          status: "failed",
          recipients,
          error: delivery.error,
        });
        continue;
      }

      const status = delivery.provider === "resend" ? "sent" : "logged";
      sent += 1;
      await upsertReportRun(admin, {
        companyId: company.id,
        dateKey: window.dateKey,
        status,
        recipients: recipients.join(",") || null,
        metrics: summarizeMetricsForLog(metrics),
        error: null,
        sentAt: new Date().toISOString(),
      });
      details.push({
        companyId: company.id,
        companyName: company.name,
        status,
        recipients,
      });
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : "Company report failed";
      try {
        await upsertReportRun(admin, {
          companyId: company.id,
          dateKey: window.dateKey,
          status: "failed",
          recipients: null,
          metrics: {},
          error: message,
        });
      } catch {
        /* ignore secondary failure */
      }
      details.push({
        companyId: company.id,
        companyName: company.name,
        status: "failed",
        error: message,
      });
    }
  }

  return {
    dateKey: window.dateKey,
    companies: (companies ?? []).length,
    sent,
    skipped,
    failed,
    details,
  };
}

async function upsertReportRun(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    companyId: string;
    dateKey: string;
    status: string;
    recipients: string | null;
    metrics: Record<string, unknown>;
    error: string | null;
    sentAt?: string | null;
  }
) {
  const { error } = await admin.from("report_runs").upsert(
    {
      company_id: input.companyId,
      report_type: "daily_evening",
      report_date: input.dateKey,
      status: input.status,
      recipients: input.recipients,
      metrics: input.metrics,
      error_message: input.error,
      sent_at: input.sentAt ?? null,
    },
    { onConflict: "company_id,report_type,report_date" }
  );

  if (error) {
    // Table may be missing before migration 023 — fail soft for that company
    if (/report_runs|does not exist|schema cache/i.test(error.message)) {
      throw new Error(
        "report_runs table missing — run supabase/migrations/023_report_runs.sql"
      );
    }
    throw new Error(error.message);
  }
}
