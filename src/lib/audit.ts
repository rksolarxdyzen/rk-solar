"use server";

import { createClient } from "@/lib/supabase/server";

export async function logAuditEvent(params: {
  companyId: string;
  leadId?: string | null;
  actorId: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  const supabase = await createClient();

  await supabase.from("audit_events").insert({
    company_id: params.companyId,
    lead_id: params.leadId ?? null,
    actor_id: params.actorId,
    event_type: params.eventType,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    metadata: params.metadata ?? {},
  });
}

export async function getLeadAuditEvents(leadId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_events")
    .select("*, actor:profiles!audit_events_actor_id_fkey(id, name, role)")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
