import type { NextRequest } from "next/server";
import { getLead, getLeadsModalByIds } from "@/actions/leads";
import { jsonError, jsonOk, requireApiUser } from "@/lib/local-first/api-json";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
  const single = request.nextUrl.searchParams.get("id")?.trim();
  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  try {
    if (single && ids.length === 0) {
      const lead = await getLead(single);
      return jsonOk(lead);
    }
    if (ids.length === 0) {
      return jsonError(new Error("ids or id is required."));
    }
    const rows = await getLeadsModalByIds(ids);
    return jsonOk(rows);
  } catch (error) {
    return jsonError(error, "Failed to load leads.");
  }
}
