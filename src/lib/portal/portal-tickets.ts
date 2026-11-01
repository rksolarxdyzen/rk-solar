import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortalTicket } from "@/lib/domain/portal";

/** Keep only tickets that belong to this lead (defense in depth after DB filter). */
export function assertTicketsBelongToLead<T extends { lead_id?: string | null; id: string }>(
  tickets: T[],
  leadId: string
): T[] {
  return tickets.filter((t) => t.lead_id === leadId);
}

/**
 * Load service tickets for one portal lead only (company + lead scoped).
 * Photos are loaded by ticket id list so the embed cannot widen the set.
 */
export async function loadPortalTicketsForLead(
  admin: SupabaseClient,
  lead: { id: string; company_id: string }
): Promise<PortalTicket[]> {
  const { data: rows, error } = await admin
    .from("service_tickets")
    .select("id, lead_id, status, description, created_at, closed_at, resolution_notes")
    .eq("company_id", lead.company_id)
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const scoped = assertTicketsBelongToLead(rows ?? [], lead.id);
  if (scoped.length === 0) return [];

  const ticketIds = scoped.map((t) => t.id);
  const { data: photos, error: photoErr } = await admin
    .from("service_ticket_photos")
    .select("id, ticket_id, file_url, caption")
    .eq("company_id", lead.company_id)
    .in("ticket_id", ticketIds);

  if (photoErr) throw new Error(photoErr.message);

  const photosByTicket = new Map<
    string,
    { id: string; file_url: string; caption: string | null }[]
  >();
  for (const p of photos ?? []) {
    const tid = p.ticket_id as string;
    if (!ticketIds.includes(tid)) continue;
    const list = photosByTicket.get(tid) ?? [];
    list.push({
      id: p.id as string,
      file_url: p.file_url as string,
      caption: (p.caption as string | null) ?? null,
    });
    photosByTicket.set(tid, list);
  }

  return scoped.map((t) => ({
    id: t.id,
    status: t.status as string,
    description: t.description as string,
    created_at: t.created_at as string,
    closed_at: (t.closed_at as string | null) ?? null,
    resolution_notes: (t.resolution_notes as string | null) ?? null,
    photos: photosByTicket.get(t.id) ?? [],
  }));
}
