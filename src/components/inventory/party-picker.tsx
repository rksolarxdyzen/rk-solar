"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createInventoryParty, searchInventoryParties } from "@/actions/inventory";
import { INVENTORY_PARTY_KIND_LABELS, type InventoryParty, type InventoryPartyKind } from "@/lib/inventory/types";

export function PartyPicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (party: InventoryParty) => void;
}) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<InventoryParty[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addKind, setAddKind] = useState<InventoryPartyKind>("dealer");
  const [addPhone, setAddPhone] = useState("");
  const [addCity, setAddCity] = useState("");
  const [addAddress, setAddAddress] = useState("");
  const [addGstin, setAddGstin] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addPending, startAdd] = useTransition();
  const reqId = useRef(0);

  function resetAdd() {
    setAddName("");
    setAddKind("dealer");
    setAddPhone("");
    setAddCity("");
    setAddAddress("");
    setAddGstin("");
    setAddError(null);
  }

  useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await searchInventoryParties(q);
      if (id !== reqId.current) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setList([]);
      } else {
        setError(null);
        setList(res.parties);
      }
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [q, open]);

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    startAdd(async () => {
      const res = await createInventoryParty({
        name: addName,
        kind: addKind,
        phone: addPhone || undefined,
        city: addCity || undefined,
        address: addAddress || undefined,
        gstin: addGstin || undefined,
      });
      if (!res.ok) return setAddError(res.error);
      onPick(res.party);
      setAddOpen(false);
      resetAdd();
      setQ("");
      onClose();
    });
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Choose company / dealer / vendor"
        subtitle="B2B stock destination — no Won gate"
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="min-h-[44px] pl-9"
                placeholder="Name, phone or city…"
                aria-label="Search parties"
              />
              {loading && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--text-muted)]" />
              )}
            </div>
            <Button type="button" variant="secondary" className="min-h-[44px] shrink-0" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add
            </Button>
          </div>
          {error && <p className="text-sm text-[var(--error)]">{error}</p>}
          <ul className="max-h-[55vh] divide-y divide-[var(--border-light)] overflow-y-auto rounded-lg border border-[var(--border)]">
            {!loading && list.length === 0 && (
              <li className="p-4 text-center text-sm text-[var(--text-muted)]">No parties found. Tap Add to create one.</li>
            )}
            {list.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    onPick(p);
                    setQ("");
                    onClose();
                  }}
                  className="flex min-h-[52px] w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--bg)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-[var(--text-dark)]">{p.name}</span>
                    <span className="block truncate text-xs text-[var(--text-muted)]">
                      {[p.phone, p.city, p.gstin ? `GSTIN ${p.gstin}` : null].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  <Badge>{INVENTORY_PARTY_KIND_LABELS[p.kind]}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Modal>

      <Modal
        open={addOpen}
        onClose={() => {
          if (addPending) return;
          setAddOpen(false);
          resetAdd();
        }}
        title="Add party"
        layer="nested"
      >
        <form onSubmit={submitAdd} className="space-y-3">
          {addError && <p className="text-sm text-[var(--error)]">{addError}</p>}
          <div>
            <Label htmlFor="party-name">Name *</Label>
            <Input
              id="party-name"
              required
              maxLength={200}
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="min-h-[44px]"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="party-kind">Kind</Label>
              <Select
                id="party-kind"
                value={addKind}
                onChange={(e) => setAddKind(e.target.value as InventoryPartyKind)}
                className="min-h-[44px]"
              >
                {(Object.keys(INVENTORY_PARTY_KIND_LABELS) as InventoryPartyKind[]).map((k) => (
                  <option key={k} value={k}>
                    {INVENTORY_PARTY_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="party-phone">Phone</Label>
              <Input
                id="party-phone"
                maxLength={40}
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
            <div>
              <Label htmlFor="party-city">City</Label>
              <Input
                id="party-city"
                maxLength={120}
                value={addCity}
                onChange={(e) => setAddCity(e.target.value)}
                className="min-h-[44px]"
              />
            </div>
            <div>
              <Label htmlFor="party-gstin">GSTIN</Label>
              <Input
                id="party-gstin"
                maxLength={20}
                value={addGstin}
                onChange={(e) => setAddGstin(e.target.value.toUpperCase())}
                className="min-h-[44px] font-mono uppercase"
                placeholder="e.g. 24AAAAA0000A1Z5"
                autoComplete="off"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="party-address">Company address</Label>
            <Textarea
              id="party-address"
              rows={3}
              maxLength={500}
              value={addAddress}
              onChange={(e) => setAddAddress(e.target.value)}
              className="min-h-[80px]"
              placeholder="Street, area, landmark…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={addPending}
              onClick={() => {
                setAddOpen(false);
                resetAdd();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={addPending || !addName.trim()}>
              {addPending ? "Saving…" : "Add"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
