import { NextResponse } from "next/server";
import { listAdSubmissions } from "@/actions/ads-inbox";
import { canViewAdSubmissions } from "@/lib/ads/access";
import { getSession } from "@/lib/auth";

function csvEscape(value: string | null | undefined): string {
  const raw = value ?? "";
  if (/[",\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !canViewAdSubmissions(session.authorities)) {
    return NextResponse.redirect(new URL("/ads/login", request.url));
  }

  const { searchParams } = new URL(request.url);
  const rows = await listAdSubmissions({
    q: searchParams.get("q") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const header = [
    "id",
    "created_at",
    "name",
    "phone",
    "email",
    "city",
    "capacity_interest",
    "message",
    "status",
    "campaign",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "utm_term",
    "gclid",
    "fbclid",
    "contacted_at",
  ];

  const lines = [
    header.join(","),
    ...rows.map((row) =>
      [
        row.id,
        row.created_at,
        row.name,
        row.phone,
        row.email,
        row.city,
        row.capacity_interest,
        row.message,
        row.status,
        row.campaign,
        row.utm_source,
        row.utm_medium,
        row.utm_campaign,
        row.utm_content,
        row.utm_term,
        row.gclid,
        row.fbclid,
        row.contacted_at,
      ]
        .map((v) => csvEscape(v))
        .join(",")
    ),
  ];

  const stamp = new Date().toISOString().slice(0, 10);
  const body = `\uFEFF${lines.join("\n")}`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rk-bhabhor-ad-enquiries-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
