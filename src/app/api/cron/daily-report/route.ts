import { NextResponse, type NextRequest } from "next/server";
import { runDailyReportJobs } from "@/lib/jobs/daily-report";

/**
 * GET/POST /api/cron/daily-report
 * Auth: Authorization: Bearer <CRON_SECRET>  OR  ?secret=<CRON_SECRET>
 *
 * Evening IST daily ops digest + employee performance section.
 * Idempotent per company/day via report_runs.
 *
 * Optional query: ?force=1 to re-send; ?companyId=<uuid> to scope one tenant.
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

  const force = request.nextUrl.searchParams.get("force") === "1";
  const companyId = request.nextUrl.searchParams.get("companyId") ?? undefined;

  try {
    const result = await runDailyReportJobs({ force, companyId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // Fail soft at HTTP layer — still return structured error without crashing other crons
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Daily report job failed",
      },
      { status: 500 }
    );
  }
}
