import type { NextRequest } from "next/server";
import { updateLead } from "@/actions/leads";
import { jsonError, jsonOk, requireApiUser } from "@/lib/local-first/api-json";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let updates: Record<string, unknown>;
  try {
    updates = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError(new Error("Invalid JSON body."));
  }

  try {
    const data = await updateLead(id, updates as Parameters<typeof updateLead>[1]);
    return jsonOk(data);
  } catch (error) {
    return jsonError(error, "Failed to update lead.");
  }
}
