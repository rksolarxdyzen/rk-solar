import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { submitAdCampaignEnquiry } from "@/lib/ads/submit";

const bodySchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().optional(),
  capacityInterest: z.string().optional(),
  message: z.string().optional(),
  website: z.string().optional(),
  campaign: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmContent: z.string().optional(),
  utmTerm: z.string().optional(),
  gclid: z.string().optional(),
  fbclid: z.string().optional(),
});

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return request.headers.get("x-real-ip");
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.parse(json);
    const ip = clientIp(request);
    const ipHash = ip
      ? createHash("sha256").update(`rk-ads:${ip}`).digest("hex").slice(0, 32)
      : undefined;

    const result = await submitAdCampaignEnquiry({
      ...parsed,
      email: parsed.email || undefined,
      landingPath: "/go",
      userAgent: request.headers.get("user-agent") ?? undefined,
      ipHash,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, id: result.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
