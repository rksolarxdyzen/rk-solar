import type { NextRequest } from "next/server";
import { getQuotation } from "@/actions/quotations";
import { jsonError, jsonOk, requireApiUser } from "@/lib/local-first/api-json";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return jsonError(new Error("id is required."));
  }

  try {
    const quote = await getQuotation(id);
    return jsonOk(quote);
  } catch (error) {
    return jsonError(error, "Failed to load quotation.");
  }
}
