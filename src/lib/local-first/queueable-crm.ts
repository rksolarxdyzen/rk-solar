import {
  runCrmMutationOrQueue,
  type RunOrQueueResult,
} from "@/lib/local-first/run-or-queue";
import { markSynced } from "@/lib/local-first/sync-status";
import { SALES_STAGE_LABELS, type SalesStage } from "@/lib/domain/workflow";

const API = "/api/local-first";

export async function queueableMoveStage(
  userId: string,
  leadId: string,
  toStage: SalesStage
): Promise<RunOrQueueResult<{ ok: true; id: string; sales_stage: string }>> {
  const result = await runCrmMutationOrQueue<{
    ok: true;
    id: string;
    sales_stage: string;
  }>({
    userId,
    mutationId: `stage:${leadId}:${toStage}`,
    label: `Move lead to ${SALES_STAGE_LABELS[toStage] ?? toStage}`,
    path: `${API}/leads/${encodeURIComponent(leadId)}/stage`,
    method: "POST",
    body: { toStage },
  });
  if (result.ok && !result.queued) markSynced();
  return result;
}

export async function queueableUpdateLead(
  userId: string,
  leadId: string,
  updates: Record<string, unknown>
): Promise<RunOrQueueResult<Record<string, unknown>>> {
  const result = await runCrmMutationOrQueue<Record<string, unknown>>({
    userId,
    mutationId: `update-lead:${leadId}`,
    label: "Save lead",
    path: `${API}/leads/${encodeURIComponent(leadId)}`,
    method: "PATCH",
    body: updates,
  });
  if (result.ok && !result.queued) markSynced();
  return result;
}

export async function queueableResolveReminder(
  userId: string,
  reminderId: string,
  leadId: string
): Promise<RunOrQueueResult<{ ok: true }>> {
  const result = await runCrmMutationOrQueue<{ ok: true }>({
    userId,
    mutationId: `resolve-reminder:${reminderId}`,
    label: "Complete reminder",
    path: `${API}/reminders/${encodeURIComponent(reminderId)}/resolve`,
    method: "POST",
    body: { leadId },
  });
  if (result.ok && !result.queued) markSynced();
  return result;
}

export async function queueableMarkLost(
  userId: string,
  leadId: string,
  reason: string,
  notes?: string
): Promise<RunOrQueueResult<Record<string, unknown>>> {
  const result = await runCrmMutationOrQueue<Record<string, unknown>>({
    userId,
    mutationId: `lost:${leadId}`,
    label: "Mark lead lost",
    path: `${API}/leads/${encodeURIComponent(leadId)}/lost`,
    method: "POST",
    body: { reason, notes },
  });
  if (result.ok && !result.queued) markSynced();
  return result;
}

export async function queueableReopenLead(
  userId: string,
  leadId: string
): Promise<RunOrQueueResult<Record<string, unknown>>> {
  const result = await runCrmMutationOrQueue<Record<string, unknown>>({
    userId,
    mutationId: `reopen:${leadId}`,
    label: "Reopen lead",
    path: `${API}/leads/${encodeURIComponent(leadId)}/reopen`,
    method: "POST",
  });
  if (result.ok && !result.queued) markSynced();
  return result;
}
