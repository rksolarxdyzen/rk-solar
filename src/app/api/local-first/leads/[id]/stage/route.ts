import type { NextRequest } from "next/server";
import { moveSalesStage } from "@/actions/leads";
import type { SalesStage } from "@/lib/domain/workflow";
import { jsonError, jsonOk, requireApiUser } from "@/lib/local-first/api-json";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  let body: { toStage?: string };
  try {
    body = (await request.json()) as { toStage?: string };
  } catch {
    return jsonError(new Error("Invalid JSON body."));
  }

  const toStage = body.toStage?.trim();
  if (!toStage) {
    return jsonError(new Error("toStage is required."));
  }

  try {
    const data = await moveSalesStage(id, toStage as SalesStage);
    return jsonOk({
      ok: true as const,
      id,
      sales_stage: (data as { sales_stage?: string })?.sales_stage ?? toStage,
    });
  } catch (error) {
    return jsonError(error, "Failed to move stage.");
  }
}
