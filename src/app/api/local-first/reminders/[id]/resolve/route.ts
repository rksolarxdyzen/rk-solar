import type { NextRequest } from "next/server";
import { resolveReminder } from "@/actions/reminders";
import { jsonError, jsonOk, requireApiUser } from "@/lib/local-first/api-json";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let body: { leadId?: string };
  try {
    body = (await request.json()) as { leadId?: string };
  } catch {
    return jsonError(new Error("Invalid JSON body."));
  }

  const leadId = body.leadId?.trim();
  if (!leadId) {
    return jsonError(new Error("leadId is required."));
  }

  try {
    await resolveReminder(id, leadId);
    return jsonOk({ ok: true as const });
  } catch (error) {
    return jsonError(error, "Failed to resolve reminder.");
  }
}
