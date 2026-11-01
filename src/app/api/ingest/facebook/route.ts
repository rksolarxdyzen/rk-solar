import { NextResponse } from "next/server";
import {
  getFacebookDefaultCompanyId,
  getFacebookPageAccessToken,
  getFacebookVerifyToken,
} from "@/lib/env";
import { ingestLead } from "@/lib/ingest/create-lead";

type GraphLeadField = { name: string; values: string[] };

function fieldMap(fields: GraphLeadField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const key = f.name.toLowerCase();
    out[key] = (f.values?.[0] ?? "").trim();
  }
  return out;
}

function pick(map: Record<string, string>, keys: string[]): string {
  for (const k of keys) {
    if (map[k]) return map[k];
  }
  return "";
}

async function fetchFacebookLead(leadgenId: string) {
  const token = getFacebookPageAccessToken();
  if (!token) return null;

  const url = new URL(`https://graph.facebook.com/v19.0/${leadgenId}`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("fields", "id,created_time,field_data,ad_id,form_id");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API error: ${res.status} ${text}`);
  }
  return res.json() as Promise<{
    id: string;
    field_data?: GraphLeadField[];
    ad_id?: string;
    form_id?: string;
  }>;
}

/** Meta webhook verification. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const expected = getFacebookVerifyToken();

  if (mode === "subscribe" && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

/** Leadgen notifications from Meta. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const companyId = getFacebookDefaultCompanyId();
    if (!companyId) {
      return NextResponse.json(
        { error: "FACEBOOK_DEFAULT_COMPANY_ID is not configured" },
        { status: 503 }
      );
    }

    const entries = Array.isArray(body?.entry) ? body.entry : [];
    const results: Array<Record<string, unknown>> = [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change?.field !== "leadgen") continue;
        const leadgenId = String(change?.value?.leadgen_id ?? "");
        if (!leadgenId) continue;

        let name = "";
        let phone = "";
        let email = "";
        let city = "";
        let address = "";
        let requirement = "";
        let graphPayload: Record<string, unknown> = { raw: change.value };

        try {
          const graph = await fetchFacebookLead(leadgenId);
          if (graph?.field_data) {
            const map = fieldMap(graph.field_data);
            name = pick(map, ["full_name", "full name", "name", "first_name"]);
            if (!name && map.first_name) {
              name = [map.first_name, map.last_name].filter(Boolean).join(" ");
            }
            phone = pick(map, ["phone_number", "phone", "mobile_number", "contact_number"]);
            email = pick(map, ["email", "email_address"]);
            city = pick(map, ["city", "town"]);
            address = pick(map, ["street_address", "address"]);
            requirement = pick(map, ["what_is_your_requirement", "requirement", "message"]);
            graphPayload = { ...graphPayload, graph };
          }
        } catch (err) {
          // Without Graph fetch we still record the event; create stub if phone missing
          graphPayload.fetchError = err instanceof Error ? err.message : "fetch failed";
        }

        if (!name) name = `Facebook Lead ${leadgenId.slice(-6)}`;
        if (!phone) phone = `000000${leadgenId.replace(/\D/g, "").slice(-4)}`.slice(-10);

        const result = await ingestLead({
          companyId,
          source: "facebook_ads",
          name,
          phone,
          email: email || null,
          city: city || null,
          address: address || null,
          requirementNotes: requirement || null,
          sourceDetail: `facebook_leadgen:${leadgenId}`,
          externalId: `fb:${leadgenId}`,
          payload: graphPayload,
        });

        results.push({ leadgenId, ...result });
      }
    }

    // Meta expects 200 quickly
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
