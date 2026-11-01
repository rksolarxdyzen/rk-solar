"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { createLead } from "@/actions/leads";
import { SALES_STAGE_LABELS, type SalesStage } from "@/lib/domain/workflow";
import { cn, formatPhone } from "@/lib/utils";
import { QUOTE_TEMPLATE_KINDS, QUOTE_TEMPLATE_LABELS, type QuoteTemplateKind } from "@/lib/quotations/types";

export type QuoteLeadOption = {
  id: string;
  name: string;
  phone: string;
  city?: string | null;
  address?: string | null;
  sales_stage: string;
  recommended_system_kw?: number | null;
  meter_type?: string | null;
};

export type QuoteCustomerSelection =
  | { mode: "lead"; lead: QuoteLeadOption }
  | {
      mode: "custom";
      customer: {
        name: string;
        phone: string;
        city: string;
        address: string;
      };
    };

type SourceMode = "lead" | "custom";

export function QuoteCustomerPicker({
  leads: initialLeads,
  canAddLead = false,
  onContinue,
}: {
  leads: QuoteLeadOption[];
  canAddLead?: boolean;
  onContinue: (selection: QuoteCustomerSelection, kind: QuoteTemplateKind) => void;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [sourceMode, setSourceMode] = useState<SourceMode>("lead");
  const [kind, setKind] = useState<QuoteTemplateKind>("solar");
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [custom, setCustom] = useState({ name: "", phone: "", city: "", address: "" });
  const [error, setError] = useState<string | null>(null);
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

  function continueFlow() {
    setError(null);
    if (sourceMode === "lead") {
      if (!selected) {
        setError("Choose a lead to continue");
        return;
      }
      onContinue({ mode: "lead", lead: selected }, kind);
      return;
    }
    if (custom.name.trim().length < 2) {
      setError("Enter the customer name");
      return;
    }
    if (custom.phone.replace(/\D/g, "").length < 10) {
      setError("Enter a valid 10-digit phone");
      return;
    }
    onContinue(
      {
        mode: "custom",
        customer: {
          name: custom.name.trim(),
          phone: custom.phone.trim(),
          city: custom.city.trim(),
          address: custom.address.trim(),
        },
      },
      kind
    );
  }

  return (
    <div className="space-y-5 rounded-xl border border-[var(--border)] bg-white p-4 sm:p-5">
      <div>
        <h2 className="font-semibold text-[var(--text-dark)]">Customer for this quote</h2>
        <p className="mt-0.5 text-sm text-[var(--text-muted)]">
          Pick an existing lead, add a new lead, or enter custom customer details.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["lead", "Choose lead"],
            ["custom", "Custom details"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setSourceMode(value);
              setError(null);
            }}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
              sourceMode === value
                ? "border-[var(--primary)] bg-[var(--primary-faint)] text-[var(--primary)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--primary)]"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {sourceMode === "lead" ? (
        <div className="space-y-3">
          <div ref={rootRef} className="relative">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <Input
                  value={
                    open
                      ? query
                      : selected
                        ? `${selected.name} · ${formatPhone(selected.phone)}`
                        : query
                  }
                  placeholder="Search lead by name, phone, or city…"
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
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  onClick={() => setAddOpen(true)}
                  title="Add lead"
                >
                  <Plus className="h-4 w-4" />
                  Add lead
                </Button>
              )}
            </div>

            {open && (
              <div className="absolute z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-[var(--border)] bg-white p-1.5 shadow-[var(--shadow-lg)]">
                {filtered.length === 0 ? (
                  <p className="px-3 py-2.5 text-sm text-[var(--text-muted)]">
                    {query.trim()
                      ? "No leads match."
                      : canAddLead
                        ? "No leads yet — use Add lead."
                        : "No leads found."}
                  </p>
                ) : (
                  filtered.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      className={cn(
                        "block w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-[var(--bg)]",
                        lead.id === selectedId
                          ? "bg-[var(--primary-faint)] text-[var(--primary)]"
                          : "text-[var(--text-dark)]"
                      )}
                      onClick={() => {
                        setSelectedId(lead.id);
                        setQuery("");
                        setOpen(false);
                        setError(null);
                      }}
                    >
                      <span className="font-medium">{lead.name}</span>
                      <span className="text-[var(--text-muted)]">
                        {" "}
                        · {formatPhone(lead.phone)}
                        {lead.city ? ` · ${lead.city}` : ""}
                      </span>
                      <span className="mt-0.5 block text-[0.7rem] text-[var(--text-muted)]">
                        {SALES_STAGE_LABELS[lead.sales_stage as SalesStage] ?? lead.sales_stage}
                        {lead.recommended_system_kw != null
                          ? ` · ${lead.recommended_system_kw} kW`
                          : ""}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {selected && (
            <div className="rounded-lg border border-[var(--border-light)] bg-[var(--bg)] px-3 py-2 text-sm">
              <p className="font-semibold text-[var(--text-dark)]">{selected.name}</p>
              <p className="text-[var(--text-muted)]">
                {formatPhone(selected.phone)}
                {selected.city ? ` · ${selected.city}` : ""}
              </p>
              {selected.address && (
                <p className="mt-0.5 text-[var(--text-body)]">{selected.address}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Customer name *</Label>
            <Input
              value={custom.name}
              onChange={(e) => setCustom({ ...custom, name: e.target.value })}
              placeholder="Full name"
              autoFocus
            />
          </div>
          <div>
            <Label>Phone *</Label>
            <Input
              value={custom.phone}
              onChange={(e) => setCustom({ ...custom, phone: e.target.value })}
              placeholder="10-digit mobile"
              inputMode="tel"
            />
          </div>
          <div>
            <Label>City</Label>
            <Input
              value={custom.city}
              onChange={(e) => setCustom({ ...custom, city: e.target.value })}
              placeholder="City"
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Site address</Label>
            <Textarea
              value={custom.address}
              onChange={(e) => setCustom({ ...custom, address: e.target.value })}
              rows={2}
              placeholder="Street / site address"
            />
          </div>
          <p className="sm:col-span-2 text-xs text-[var(--text-muted)]">
            Custom quotes are saved with these customer details and are not linked to a CRM lead.
          </p>
        </div>
      )}

      <div className="max-w-xs">
        <Label>Template</Label>
        <Select
          value={kind}
          onChange={(e) => setKind(e.target.value as QuoteTemplateKind)}
        >
          {QUOTE_TEMPLATE_KINDS.map((templateKind) => (
            <option key={templateKind} value={templateKind}>
              {QUOTE_TEMPLATE_LABELS[templateKind]}
            </option>
          ))}
        </Select>
      </div>

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}

      <div className="flex justify-end">
        <Button type="button" onClick={continueFlow}>
          Continue to quote builder
        </Button>
      </div>

      {canAddLead && (
        <AddLeadForQuoteModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          onCreated={(lead) => {
            setLeads((prev) => [lead, ...prev.filter((l) => l.id !== lead.id)]);
            setSelectedId(lead.id);
            setSourceMode("lead");
            setAddOpen(false);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

function AddLeadForQuoteModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (lead: QuoteLeadOption) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const lead = await createLead({
          name: fd.get("name") as string,
          phone: fd.get("phone") as string,
          email: (fd.get("email") as string) || "",
          city: (fd.get("city") as string) || undefined,
          address: (fd.get("address") as string) || undefined,
          requirement_notes: (fd.get("requirement_notes") as string) || undefined,
          temperature: (fd.get("temperature") as "hot" | "warm" | "cold") || "warm",
          source: "manual",
        });
        onCreated({
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          city: lead.city,
          address: lead.address,
          sales_stage: lead.sales_stage,
          recommended_system_kw: lead.recommended_system_kw ?? null,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create lead");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => !pending && onClose()}
      title="Add lead"
      subtitle="Creates a CRM lead, then continues to the quote"
      size="lg"
      layer="nested"
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Customer name *</Label>
            <Input name="name" required placeholder="Full name" autoFocus />
          </div>
          <div>
            <Label>Phone *</Label>
            <Input name="phone" required placeholder="10-digit mobile" inputMode="tel" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>City</Label>
            <Input name="city" placeholder="City" />
          </div>
          <div>
            <Label>Priority</Label>
            <Select name="temperature" defaultValue="warm">
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
            </Select>
          </div>
        </div>
        <div>
          <Label>Address</Label>
          <Input name="address" placeholder="Site address" />
        </div>
        <div>
          <Label>Email</Label>
          <Input name="email" type="email" placeholder="optional" />
        </div>
        <div>
          <Label>Requirement notes</Label>
          <Textarea name="requirement_notes" placeholder="System size, roof type…" rows={2} />
        </div>
        {error && <p className="text-sm text-[var(--error)]">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Create lead & use"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
