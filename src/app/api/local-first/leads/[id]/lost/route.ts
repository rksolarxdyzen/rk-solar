import type { NextRequest } from "next/server";
import { markLeadLost } from "@/actions/leads";
import { jsonError, jsonOk, requireApiUser } from "@/lib/local-first/api-json";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let body: { reason?: string; notes?: string };
  try {
    body = (await request.json()) as { reason?: string; notes?: string };
  } catch {
    return jsonError(new Error("Invalid JSON body."));
  }

  const reason = body.reason?.trim();
  if (!reason) {
    return jsonError(new Error("reason is required."));
  }

  try {
    const data = await markLeadLost(id, reason, body.notes);
    return jsonOk(data);
  } catch (error) {
    return jsonError(error, "Failed to mark lost.");
  }
}
