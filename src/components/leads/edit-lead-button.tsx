"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { updateLead } from "@/actions/leads";
import { useOptionalLocalFirstSession } from "@/components/local-first/local-first-session";
import { queueableUpdateLead } from "@/lib/local-first/queueable-crm";
import {
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  TEMPERATURES,
  TEMPERATURE_LABELS,
} from "@/lib/domain/workflow";
import {
  METER_OWNERSHIP_LABELS,
  METER_OWNERSHIPS,
  METER_TYPE_LABELS,
  METER_TYPES,
  PAYMENT_PLAN_LABELS,
  PAYMENT_PLANS,
  type MeterOwnership,
  type MeterType,
  type PaymentPlan,
} from "@/lib/domain/lead-profile";
import type { LeadWithRelations } from "@/lib/domain/types";

export function EditLeadButton({
  lead,
  onDone,
}: {
  lead: LeadWithRelations;
  onDone?: () => void;
}) {
  const session = useOptionalLocalFirstSession();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const meterType = (fd.get("meter_type") as string) || "";
    const meterOwnership = (fd.get("meter_ownership") as string) || "";
    const paymentPlan = (fd.get("payment_plan") as string) || "";
    setError(null);
    startTransition(async () => {
      try {
        const phone = String(fd.get("phone") ?? "");
        const digits = phone.replace(/\D/g, "");
        if (digits.length < 10) {
          throw new Error("Enter a valid 10-digit mobile number");
        }
        const updates = {
          name: fd.get("name") as string,
          phone,
          email: (fd.get("email") as string) || null,
          city: (fd.get("city") as string) || null,
          address: (fd.get("address") as string) || null,
          requirement_notes: (fd.get("requirement_notes") as string) || null,
          temperature: fd.get("temperature") as "hot" | "warm" | "cold",
          source: fd.get("source") as (typeof LEAD_SOURCES)[number],
          alternate_phone: (fd.get("alternate_phone") as string) || null,
          meter_type: meterType ? (meterType as MeterType) : null,
          meter_ownership: meterOwnership
            ? (meterOwnership as MeterOwnership)
            : null,
          payment_plan: paymentPlan ? (paymentPlan as PaymentPlan) : null,
        };
        if (session?.userId) {
          const result = await queueableUpdateLead(
            session.userId,
            lead.id,
            updates
          );
          if (!result.ok) throw new Error(result.error);
        } else {
          await updateLead(lead.id, updates);
        }
        setOpen(false);
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="h-3.5 w-3.5" /> Edit
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Edit lead"
        subtitle={lead.name}
        size="lg"
        layer="nested"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Name *</Label>
              <Input name="name" required defaultValue={lead.name} />
            </div>
            <div>
              <Label>Phone *</Label>
              <Input name="phone" required defaultValue={lead.phone} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Alternate phone</Label>
              <Input name="alternate_phone" defaultValue={lead.alternate_phone ?? ""} />
            </div>
            <div>
              <Label>Email</Label>
              <Input name="email" type="email" defaultValue={lead.email ?? ""} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>City</Label>
              <Input name="city" defaultValue={lead.city ?? ""} />
            </div>
            <div>
              <Label>Priority</Label>
              <Select name="temperature" defaultValue={lead.temperature}>
                {TEMPERATURES.map((t) => (
                  <option key={t} value={t}>
                    {TEMPERATURE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Select name="source" defaultValue={lead.source}>
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_SOURCE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Meter type</Label>
              <Select name="meter_type" defaultValue={lead.meter_type ?? ""}>
                <option value="">Not set</option>
                {METER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {METER_TYPE_LABELS[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Meter name / ownership</Label>
              <Select name="meter_ownership" defaultValue={lead.meter_ownership ?? ""}>
                <option value="">Not set</option>
                {METER_OWNERSHIPS.map((o) => (
                  <option key={o} value={o}>
                    {METER_OWNERSHIP_LABELS[o]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Payment plan</Label>
              <Select name="payment_plan" defaultValue={lead.payment_plan ?? ""}>
                <option value="">Not set</option>
                {PAYMENT_PLANS.map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_PLAN_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input name="address" defaultValue={lead.address ?? ""} />
          </div>
          <div>
            <Label>Requirement notes</Label>
            <Textarea
              name="requirement_notes"
              defaultValue={lead.requirement_notes ?? ""}
              rows={3}
            />
          </div>
          {error && (
            <p className="rounded-lg border border-red-200 bg-[var(--error-light)] px-3 py-2 text-sm text-[var(--error)]">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
