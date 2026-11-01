import { NextResponse, type NextRequest } from "next/server";
import { runReminderJobs } from "@/lib/jobs/reminders";

/**
 * GET/POST /api/cron/reminders
 * Auth: Authorization: Bearer <CRON_SECRET>  OR  ?secret=<CRON_SECRET>
 *
 * Enqueues overdue subsidy + due cleaning reminders, then flushes notification_outbox
 * (marks sent; optionally POSTs customer events to WHATSAPP_WEBHOOK_URL).
 */
export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured" },
      { status: 503 }
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const querySecret = request.nextUrl.searchParams.get("secret") ?? "";
  if (bearer !== expected && querySecret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runReminderJobs();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Job failed" },
      { status: 500 }
    );
  }
}
