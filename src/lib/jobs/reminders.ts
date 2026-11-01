import { createAdminClient } from "@/lib/supabase/admin";
import { computeCleaningDueAt, isCleaningDue } from "@/lib/domain/maintenance";
import { isSubsidyTimerOverdue } from "@/lib/domain/portal";
import { getAppUrl } from "@/lib/env";

/**
 * Cron / service-role jobs for subsidy + cleaning reminders and outbox flush.
 * Auth is enforced by the API route (CRON_SECRET), not user session.
 */
export async function runReminderJobs() {
  const admin = createAdminClient();

  const subsidy = await enqueueSubsidyFollowupsAdmin(admin);
  const cleaning = await enqueueCleaningRemindersAdmin(admin);
  const outbox = await flushNotificationOutboxAdmin(admin);

  return { subsidy, cleaning, outbox };
}

async function enqueueSubsidyFollowupsAdmin(
  admin: ReturnType<typeof createAdminClient>
) {
  const { data, error } = await admin
    .from("leads")
    .select(
      "id, name, company_id, subsidy_timer_due_at, subsidy_received_at, subsidy_followup_sent_at"
    )
    .not("subsidy_timer_due_at", "is", null)
    .is("subsidy_received_at", null);

  if (error) throw new Error(error.message);

  let enqueued = 0;
  for (const lead of data ?? []) {
    if (!isSubsidyTimerOverdue(lead)) continue;
    if (lead.subsidy_followup_sent_at) continue;

    await admin.from("notification_outbox").insert({
      company_id: lead.company_id,
      lead_id: lead.id,
      event_type: "subsidy_timer_overdue",
      audience: "liaison",
      payload: { leadName: lead.name, dueAt: lead.subsidy_timer_due_at },
      status: "pending",
    });

    await admin
      .from("leads")
      .update({ subsidy_followup_sent_at: new Date().toISOString() })
      .eq("id", lead.id);

    enqueued += 1;
  }

  return { enqueued };
}

async function enqueueCleaningRemindersAdmin(
  admin: ReturnType<typeof createAdminClient>
) {
  const { data, error } = await admin
    .from("leads")
    .select(
      "id, name, company_id, phone, portal_code, cleaning_next_due_at, sales_stage"
    )
    .eq("sales_stage", "completed")
    .not("cleaning_next_due_at", "is", null);

  if (error) throw new Error(error.message);

  let enqueued = 0;
  const appUrl = getAppUrl() ?? "";

  for (const lead of data ?? []) {
    if (!isCleaningDue(lead)) continue;

    const portalPath = lead.portal_code ? `${appUrl}/portal/${lead.portal_code}` : null;
    await admin.from("notification_outbox").insert({
      company_id: lead.company_id,
      lead_id: lead.id,
      event_type: "cleaning_reminder",
      audience: "customer",
      payload: {
        leadName: lead.name,
        phone: lead.phone,
        portalCode: lead.portal_code,
        portalUrl: portalPath,
        referralHint: true,
        message:
          "Please clean your solar panels for optimal yield. Know someone going solar? Ask us for your referral link.",
        whatsappText: encodeURIComponent(
          `Hi ${lead.name}, reminder to clean your KT solar panels for best yield. Portal: ${portalPath ?? "ask our team"}. Know someone going solar? We'd love a referral!`
        ),
      },
      status: "pending",
    });

    await admin
      .from("leads")
      .update({
        cleaning_last_sent_at: new Date().toISOString(),
        cleaning_next_due_at: computeCleaningDueAt().toISOString(),
      })
      .eq("id", lead.id);

    enqueued += 1;
  }

  return { enqueued };
}

/** Mark pending outbox rows as sent (stub) or attempt WhatsApp webhook if configured. */
async function flushNotificationOutboxAdmin(
  admin: ReturnType<typeof createAdminClient>
) {
  const { data, error } = await admin
    .from("notification_outbox")
    .select("id, event_type, audience, payload, lead_id, company_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) throw new Error(error.message);

  const webhook = process.env.WHATSAPP_WEBHOOK_URL?.trim();
  let sent = 0;
  let failed = 0;

  for (const row of data ?? []) {
    try {
      if (webhook && row.audience === "customer") {
        const payload = (row.payload ?? {}) as Record<string, unknown>;
        const phone = String(payload.phone ?? "").replace(/\D/g, "");
        const res = await fetch(webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: phone,
            eventType: row.event_type,
            leadId: row.lead_id,
            payload,
          }),
        });
        if (!res.ok) throw new Error(`WhatsApp webhook ${res.status}`);
      }

      await admin
        .from("notification_outbox")
        .update({ status: "sent" })
        .eq("id", row.id);
      sent += 1;
    } catch {
      await admin
        .from("notification_outbox")
        .update({ status: "failed" })
        .eq("id", row.id);
      failed += 1;
    }
  }

  return { processed: (data ?? []).length, sent, failed };
}
