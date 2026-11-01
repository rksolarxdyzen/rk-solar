import { BRAND, ROLE_LABELS } from "@/lib/brand";
import { formatCurrency } from "@/lib/utils";
import type { DailyReportMetrics } from "@/lib/reports/daily-metrics";

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function row(label: string, value: string) {
  return `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e9eef8;color:#35486f;font-size:14px;">${esc(label)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e9eef8;color:#1d2d51;font-size:14px;font-weight:700;text-align:right;">${esc(value)}</td>
  </tr>`;
}

export function buildDailyReportEmailHtml(metrics: DailyReportMetrics): string {
  const m = metrics;
  const empRows =
    m.employees.length === 0
      ? `<tr><td colspan="6" style="padding:12px;color:#6c7a99;font-size:13px;">No tele-caller / sales / surveyor activity profiles.</td></tr>`
      : m.employees
          .map(
            (e) => `<tr>
              <td style="padding:8px;border-bottom:1px solid #e9eef8;font-size:13px;">${esc(e.name)}<br/><span style="color:#6c7a99;font-size:11px;">${esc(ROLE_LABELS[e.role] ?? e.role)}</span></td>
              <td style="padding:8px;border-bottom:1px solid #e9eef8;font-size:13px;text-align:right;">${e.assignedLeads}</td>
              <td style="padding:8px;border-bottom:1px solid #e9eef8;font-size:13px;text-align:right;">${e.uncontactedNew}</td>
              <td style="padding:8px;border-bottom:1px solid #e9eef8;font-size:13px;text-align:right;">${e.callsToday}</td>
              <td style="padding:8px;border-bottom:1px solid #e9eef8;font-size:13px;text-align:right;">${e.visitsCompletedToday}</td>
              <td style="padding:8px;border-bottom:1px solid #e9eef8;font-size:13px;text-align:right;font-weight:600;">${esc(formatCurrency(e.revenueToday))}</td>
            </tr>`
          )
          .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>${esc(BRAND.shortName)} Daily Report</title></head>
<body style="margin:0;padding:0;background:#f4f7fc;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7fc;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #d7dfef;">
        <tr>
          <td style="background:linear-gradient(145deg,#1d2d51 0%,#3158a6 55%,#274887 100%);padding:28px 28px 24px;">
            <p style="margin:0;color:#ffa800;font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;">${esc(BRAND.name)}</p>
            <h1 style="margin:10px 0 6px;color:#ffffff;font-size:24px;font-weight:700;">Evening operations report</h1>
            <p style="margin:0;color:rgba(255,255,255,0.75);font-size:14px;">${esc(m.companyName)} · ${esc(m.dateLabel)} (IST)</p>
          </td>
        </tr>
        <tr><td style="padding:24px 28px 8px;">
          <h2 style="margin:0 0 12px;color:#1d2d51;font-size:16px;">Lead conversion</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e9eef8;border-radius:12px;overflow:hidden;">
            ${row("Leads reached today", String(m.leadsReachedToday))}
            ${row("New stage — still uncontacted", String(m.newUncontacted))}
          </table>
        </td></tr>
        <tr><td style="padding:16px 28px 8px;">
          <h2 style="margin:0 0 12px;color:#1d2d51;font-size:16px;">Field operations</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e9eef8;border-radius:12px;overflow:hidden;">
            ${row("Surveys completed today", String(m.surveysCompletedToday))}
            ${row("Quotations sent today (deduped)", String(m.quotationsSentToday))}
          </table>
        </td></tr>
        <tr><td style="padding:16px 28px 8px;">
          <h2 style="margin:0 0 12px;color:#1d2d51;font-size:16px;">Financial summary</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e9eef8;border-radius:12px;overflow:hidden;">
            ${row("Revenue generated today", formatCurrency(m.revenueToday))}
            ${row("Cash collected today", formatCurrency(m.cashCollectedToday))}
          </table>
        </td></tr>
        <tr><td style="padding:16px 28px 8px;">
          <h2 style="margin:0 0 12px;color:#1d2d51;font-size:16px;">Installations & service</h2>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e9eef8;border-radius:12px;overflow:hidden;">
            ${row("Installations completed today", String(m.installationsCompletedToday))}
            ${row("Tickets opened today", String(m.ticketsOpenedToday))}
            ${row("Tickets closed today", String(m.ticketsClosedToday))}
            ${row("Open tickets (total)", String(m.ticketsOpenTotal))}
          </table>
        </td></tr>
        <tr><td style="padding:16px 28px 8px;">
          <h2 style="margin:0 0 4px;color:#1d2d51;font-size:16px;">Employee performance</h2>
          <p style="margin:0 0 12px;color:#6c7a99;font-size:12px;">Assigned leads · uncontacted new · calls today · visits today · revenue (Won today → tele-caller)</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e9eef8;border-radius:12px;overflow:hidden;">
            <tr style="background:#f4f7fc;">
              <th align="left" style="padding:8px;font-size:11px;color:#6c7a99;text-transform:uppercase;">Employee</th>
              <th align="right" style="padding:8px;font-size:11px;color:#6c7a99;text-transform:uppercase;">Assigned</th>
              <th align="right" style="padding:8px;font-size:11px;color:#6c7a99;text-transform:uppercase;">New</th>
              <th align="right" style="padding:8px;font-size:11px;color:#6c7a99;text-transform:uppercase;">Calls</th>
              <th align="right" style="padding:8px;font-size:11px;color:#6c7a99;text-transform:uppercase;">Visits</th>
              <th align="right" style="padding:8px;font-size:11px;color:#6c7a99;text-transform:uppercase;">Revenue</th>
            </tr>
            ${empRows}
          </table>
        </td></tr>
        <tr>
          <td style="padding:20px 28px 28px;color:#96a1b9;font-size:11px;text-align:center;">
            Automated evening digest · ${esc(BRAND.poweredBy)}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function buildDailyReportSubject(metrics: DailyReportMetrics): string {
  return `${BRAND.shortName} daily report · ${metrics.dateKey} · ${metrics.companyName}`;
}
