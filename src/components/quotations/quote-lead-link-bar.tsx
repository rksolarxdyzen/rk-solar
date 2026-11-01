"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createLead } from "@/actions/leads";
import { SALES_STAGE_LABELS, type SalesStage } from "@/lib/domain/workflow";
import { cn, formatPhone } from "@/lib/utils";
import type { QuoteCustomerSelection, QuoteLeadOption } from "@/components/quotations/quote-customer-picker";

export type { QuoteCustomerSelection, QuoteLeadOption };

type SourceMode = "lead" | "custom";

/** Inline lead / custom customer bar — no separate continue step. */
export function QuoteLeadLinkBar({
  leads: initialLeads,
  canAddLead = false,
  selection,
  initialLead = null,
  onChange,
}: {
  leads: QuoteLeadOption[];
  canAddLead?: boolean;
  selection: QuoteCustomerSelection | null;
  initialLead?: QuoteLeadOption | null;
  onChange: (selection: QuoteCustomerSelection | null) => void;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [sourceMode, setSourceMode] = useState<SourceMode>(
    selection?.mode === "custom" ? "custom" : "lead"
  );
  const [selectedId, setSelectedId] = useState<string>(
    selection?.mode === "lead" ? selection.lead.id : initialLead?.id ?? ""
  );
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [custom, setCustom] = useState({
    name: selection?.mode === "custom" ? selection.customer.name : "",
    phone: selection?.mode === "custom" ? selection.customer.phone : "",
    city: selection?.mode === "custom" ? selection.customer.city : "",
    address: selection?.mode === "custom" ? selection.customer.address : "",
  });
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

  const selected = leads.find((l) => l.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = query.replace(/\D/g, "");
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        (digits.length >= 2 && l.phone.replace(/\D/g, "").includes(digits)) ||
        (l.city?.toLowerCase().includes(q) ?? false)
    );
  }, [leads, query]);

  function pickLead(lead: QuoteLeadOption) {
    setSelectedId(lead.id);
    setQuery("");
    setOpen(false);
    onChange({ mode: "lead", lead });
  }

  function applyCustom() {
    if (custom.name.trim().length < 2 || custom.phone.replace(/\D/g, "").length < 10) return;
    onChange({
      mode: "custom",
      customer: {
        name: custom.name.trim(),
        phone: custom.phone.trim(),
        city: custom.city.trim(),
        address: custom.address.trim(),
      },
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Link customer
        </p>
        <div className="flex gap-1.5">
          {(
            [
              ["lead", "From lead"],
              ["custom", "Custom"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSourceMode(value)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
                sourceMode === value
                  ? "border-[var(--primary)] bg-[var(--primary-faint)] text-[var(--primary)]"
                  : "border-[var(--border)] text-[var(--text-muted)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {sourceMode === "lead" ? (
        <div ref={rootRef} className="relative">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                value={
                  open ? query : selected ? `${selected.name} · ${formatPhone(selected.phone)}` : query
                }
                placeholder="Search lead by name or phone…"
                className="pl-9"
                onFocus={() => {
                  setOpen(true);
                  setQuery("");
                }}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                }}
              />
            </div>
            {canAddLead && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            )}
          </div>
          {open && (
            <div className="absolute z-30 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-[var(--shadow-lg)]">
              {filtered.length === 0 ? (
                <p className="px-3 py-2 text-sm text-[var(--text-muted)]">No leads match.</p>
              ) : (
                filtered.map((lead) => (
                  <button
                    key={lead.id}
                    type="button"
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--bg)]",
                      lead.id === selectedId && "bg-[var(--primary-faint)] text-[var(--primary)]"
                    )}
                    onClick={() => pickLead(lead)}
                  >
                    <span className="font-medium">{lead.name}</span>
                    <span className="text-[var(--text-muted)]"> · {formatPhone(lead.phone)}</span>
                    <span className="mt-0.5 block text-[0.65rem] text-[var(--text-muted)]">
                      {SALES_STAGE_LABELS[lead.sales_stage as SalesStage] ?? lead.sales_stage}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input
              value={custom.name}
              onChange={(e) => setCustom({ ...custom, name: e.target.value })}
              onBlur={applyCustom}
            />
          </div>
          <div>
            <Label>Phone</Label>
            <Input
              value={custom.phone}
              onChange={(e) => setCustom({ ...custom, phone: e.target.value })}
              onBlur={applyCustom}
              inputMode="tel"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Textarea
              rows={2}
              value={custom.address}
              onChange={(e) => setCustom({ ...custom, address: e.target.value })}
              onBlur={applyCustom}
            />
          </div>
        </div>
      )}

      {addOpen && (
        <AddLeadModal
          onClose={() => setAddOpen(false)}
          onCreated={(lead) => {
            setLeads((prev) => [lead, ...prev]);
            pickLead(lead);
            setAddOpen(false);
          }}
        />
      )}
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
