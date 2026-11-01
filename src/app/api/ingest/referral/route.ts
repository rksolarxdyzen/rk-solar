import { NextResponse } from "next/server";
import { z } from "zod";
import { ingestLead, resolveReferralLink } from "@/lib/ingest/create-lead";

const bodySchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().optional(),
  address: z.string().optional(),
  requirement: z.string().optional(),
  referrerName: z.string().optional(),
  referrerPhone: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = bodySchema.parse(json);
    const link = await resolveReferralLink(parsed.code.trim());

    if (!link || !link.is_active) {
      return NextResponse.json({ error: "Invalid or inactive referral link" }, { status: 404 });
    }

    const companyId = link.company_id as string;
    const result = await ingestLead({
      companyId,
      source: "referral",
      name: parsed.name,
      phone: parsed.phone,
      email: parsed.email || null,
      city: parsed.city || null,
      address: parsed.address || null,
      requirementNotes: parsed.requirement || null,
      sourceDetail: `referral:${parsed.code}`,
      externalId: null,
      referrerName: parsed.referrerName || null,
      referrerPhone: parsed.referrerPhone || null,
      payload: { code: parsed.code, via: "public_form" },
    });

    if (result.status === "error") {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      status: result.status,
      leadId: result.leadId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
