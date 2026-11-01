import type { NextRequest } from "next/server";
import { reopenLead } from "@/actions/leads";
import { jsonError, jsonOk, requireApiUser } from "@/lib/local-first/api-json";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;

  try {
    const data = await reopenLead(id);
    return jsonOk(data);
  } catch (error) {
    return jsonError(error, "Failed to reopen lead.");
  }
}
