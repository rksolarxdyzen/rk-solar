"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createLead } from "@/actions/leads";
import { SALES_STAGE_LABELS, type SalesStage } from "@/lib/domain/workflow";
import { cn, formatPhone } from "@/lib/utils";
import type { QuoteLeadOption } from "@/components/quotations/quote-customer-picker";

export function LeadNameAutocomplete({
  leads: initialLeads,
  canAddLead = false,
  value,
  onChange,
  onLeadSelect,
  selectedLeadId,
  placeholder = "Start typing name to search leads…",
  className,
  error,
}: {
  leads: QuoteLeadOption[];
  canAddLead?: boolean;
  value: string;
  onChange: (name: string) => void;
  onLeadSelect: (lead: QuoteLeadOption) => void;
  selectedLeadId?: string | null;
  placeholder?: string;
  className?: string;
  error?: string;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLeads(initialLeads);
  }, [initialLeads]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const digits = value.replace(/\D/g, "");
    if (!q) return [];
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.name.toLowerCase().startsWith(q) ||
        l.phone.includes(q) ||
        (digits.length >= 2 && l.phone.replace(/\D/g, "").includes(digits)) ||
        (l.city?.toLowerCase().includes(q) ?? false)
    );
  }, [leads, value]);

  const showSuggestions = open && value.trim().length > 0 && filtered.length > 0;

  function pickLead(lead: QuoteLeadOption) {
    onLeadSelect(lead);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <div className="flex gap-2">
        <Input
          value={value}
          placeholder={placeholder}
          className="min-h-11"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
        />
        {canAddLead ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => setAddOpen(true)}
            title="Add new lead"
          >
            <Plus className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {selectedLeadId ? (
        <p className="mt-1 text-[11px] font-medium text-[var(--primary)]">Linked to pipeline lead</p>
      ) : null}

      {showSuggestions ? (
        <div className="absolute z-30 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-[var(--shadow-lg)]">
          {filtered.map((lead) => (
            <button
              key={lead.id}
              type="button"
              className={cn(
                "block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--bg)]",
                lead.id === selectedLeadId && "bg-[var(--primary-faint)] text-[var(--primary)]"
              )}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pickLead(lead)}
            >
              <span className="font-medium">{lead.name}</span>
              <span className="text-[var(--text-muted)]"> · {formatPhone(lead.phone)}</span>
              {lead.city ? (
                <span className="text-[var(--text-muted)]"> · {lead.city}</span>
              ) : null}
              <span className="mt-0.5 block text-[0.65rem] text-[var(--text-muted)]">
                {SALES_STAGE_LABELS[lead.sales_stage as SalesStage] ?? lead.sales_stage}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}

      {addOpen ? (
        <AddLeadModal
          onClose={() => setAddOpen(false)}
          onCreated={(lead) => {
            setLeads((prev) => [lead, ...prev]);
            pickLead(lead);
            setAddOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function AddLeadModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (lead: QuoteLeadOption) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal open onClose={onClose} title="Add lead">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          const fd = new FormData(e.currentTarget);
          start(async () => {
            try {
              const data = await createLead({
                name: fd.get("name") as string,
                phone: fd.get("phone") as string,
                city: (fd.get("city") as string) || undefined,
                address: (fd.get("address") as string) || undefined,
                source: "manual",
              });
              onCreated({
                id: data.id,
                name: data.name,
                phone: data.phone,
                city: data.city,
                address: data.address,
                sales_stage: data.sales_stage ?? "new",
              });
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to add lead");
            }
          });
        }}
      >
        <div>
          <Label>Name *</Label>
          <Input name="name" required />
        </div>
        <div>
          <Label>Phone *</Label>
          <Input name="phone" required inputMode="tel" />
        </div>
        <div>
          <Label>City</Label>
          <Input name="city" />
        </div>
        <div>
          <Label>Address</Label>
          <Textarea name="address" rows={2} />
        </div>
        {error ? <p className="text-sm text-[var(--error)]">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save lead"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
