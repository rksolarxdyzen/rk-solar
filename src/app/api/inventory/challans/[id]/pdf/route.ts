import { NextResponse, type NextRequest } from "next/server";
import { createElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { getInventoryAccess } from "@/lib/inventory/queries";
import { getMovementDetail } from "@/lib/inventory/movements";
import { ChallanDocument, type ChallanDocProps } from "@/lib/inventory/challan-document";
import { buildCompanyPrintInfo } from "@/lib/quotations/quotation-print";
import { formatDate } from "@/lib/inventory/format";
import { INVENTORY_UNIT_LABELS } from "@/lib/inventory/types";
import { BRAND } from "@/lib/quotations/brand";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadLogo(request: NextRequest): Promise<ChallanDocProps["logo"]> {
  // RK Bhabhor is text-branded — no company logo asset.
  const primary = BRAND.logo.primary?.trim();
  if (!primary) return null;
  try {
    const res = await fetch(new URL(primary, request.url), { cache: "force-cache" });
    if (!res.ok) return null;
    return { data: Buffer.from(await res.arrayBuffer()), format: "png" };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getInventoryAccess();
  if (!ctx) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  if (!ctx.access.canView) return NextResponse.json({ error: "You do not have permission to view inventory." }, { status: 403 });

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Challan not found." }, { status: 404 });
  const m = await getMovementDetail(id);
  if (!m || (m.movement_type !== "dispatch" && m.movement_type !== "return")) {
    return NextResponse.json({ error: "Challan not found." }, { status: 404 });
  }

  const isReturn = m.movement_type === "return";
  const supabase = await createClient();
  const [{ data: settings }, { data: company }, logo] = await Promise.all([
    supabase
      .from("quotation_company_settings")
      .select("from_name,from_phone,from_email")
      .eq("company_id", ctx.profile.company_id)
      .maybeSingle(),
    supabase.from("companies").select("name,phone,email").eq("id", ctx.profile.company_id).maybeSingle(),
    loadLogo(request),
  ]);
  const info = buildCompanyPrintInfo(settings, company);

  const element = createElement(ChallanDocument, {
    variant: isReturn ? "return" : "delivery",
    challanNo: m.movement_no,
    date: formatDate(m.movement_date),
    reversed: Boolean(m.reversed_by_id),
    company: { name: info.name, phone: info.phone, email: info.email, address: info.address, gstin: info.gstin },
    logo,
    customer: m.party
      ? {
          name: m.party.name,
          phone: m.party.phone,
          address: [m.party.address, m.party.city].filter(Boolean).join(", ") || m.party.city,
          partyKind: m.party.kind ? m.party.kind.charAt(0).toUpperCase() + m.party.kind.slice(1) : null,
        }
      : {
          name: m.customer?.name ?? "Customer",
          phone: m.customer?.phone,
          address: m.customer?.address || m.customer?.city,
          meterName: m.customer?.meter_name,
        },
    vehicleNo: m.vehicle_no,
    deliveredBy: m.delivered_by,
    notes: m.notes,
    lines: m.lines.map((l) => ({
      name: l.item_name,
      sku: l.sku,
      hsn: l.hsn,
      quantity: Math.abs(l.quantity_delta),
      unit: INVENTORY_UNIT_LABELS[l.unit_type],
      serials: l.serials,
      returnCondition: l.return_condition,
    })),
  }) as Parameters<typeof renderToBuffer>[0];

  const buffer = await renderToBuffer(element);
  const download = request.nextUrl.searchParams.get("download") === "1";
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${m.movement_no.replace(/[^\w.-]+/g, "_")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
