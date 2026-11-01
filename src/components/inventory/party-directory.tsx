"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { createInventoryParty, updateInventoryParty } from "@/actions/inventory";
import { INVENTORY_PARTY_KIND_LABELS, type InventoryParty, type InventoryPartyKind } from "@/lib/inventory/types";

export function PartyDirectory({ initial }: { initial: InventoryParty[] }) {
  const [pending, startTransition] = useTransition();
  const [parties, setParties] = useState(initial);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<InventoryPartyKind>("dealer");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return parties.filter((p) => {
      if (!showInactive && !p.is_active) return false;
      if (!needle) return true;
      return [p.name, p.phone, p.city, p.kind, p.gstin, p.address].some((v) => (v ?? "").toLowerCase().includes(needle));
    });
  }, [parties, q, showInactive]);

  function add() {
    setError(null);
    startTransition(async () => {
      const res = await createInventoryParty({
        name,
        kind,
        phone,
        city,
        address: address || undefined,
        gstin: gstin || undefined,
      });
      if (!res.ok) return setError(res.error);
      setParties((prev) => {
        const rest = prev.filter((p) => p.id !== res.party.id);
        return [res.party, ...rest];
      });
      setName("");
      setPhone("");
      setCity("");
      setAddress("");
      setGstin("");
    });
  }

  function toggleActive(p: InventoryParty) {
    setError(null);
    startTransition(async () => {
      const res = await updateInventoryParty({
        id: p.id,
        name: p.name,
        kind: p.kind,
        phone: p.phone ?? undefined,
        city: p.city ?? undefined,
        address: p.address ?? undefined,
        gstin: p.gstin ?? undefined,
        is_active: !p.is_active,
      });
      if (!res.ok) return setError(res.error);
      setParties((prev) => prev.map((row) => (row.id === res.party.id ? res.party : row)));
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-[var(--error)] bg-[var(--error-light)] px-4 py-3 text-sm font-medium text-[var(--error)]">
          {error}
        </div>
      )}

      <Card className="space-y-3">
        <p className="text-sm font-semibold text-[var(--text-dark)]">Add company / dealer / vendor</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="party-name">Name</Label>
            <Input id="party-name" value={name} onChange={(e) => setName(e.target.value)} className="min-h-[44px]" />
          </div>
          <div>
            <Label htmlFor="party-kind">Kind</Label>
            <select
              id="party-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as InventoryPartyKind)}
              className="min-h-[44px] w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 text-sm"
            >
              {(Object.keys(INVENTORY_PARTY_KIND_LABELS) as InventoryPartyKind[]).map((k) => (
                <option key={k} value={k}>
                  {INVENTORY_PARTY_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="party-phone">Phone</Label>
            <Input id="party-phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="min-h-[44px]" />
          </div>
          <div>
            <Label htmlFor="party-city">City</Label>
            <Input id="party-city" value={city} onChange={(e) => setCity(e.target.value)} className="min-h-[44px]" />
          </div>
          <div>
            <Label htmlFor="party-gstin">GSTIN</Label>
            <Input
              id="party-gstin"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              className="min-h-[44px] font-mono uppercase"
              maxLength={20}
              placeholder="e.g. 24AAAAA0000A1Z5"
              autoComplete="off"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label htmlFor="party-address">Company address</Label>
            <Textarea
              id="party-address"
              rows={2}
              maxLength={500}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="min-h-[72px]"
              placeholder="Street, area, landmark…"
            />
          </div>
        </div>
        <Button type="button" onClick={add} disabled={pending || !name.trim()} className="min-h-[44px]">
          {pending ? "Saving…" : "Add party"}
        </Button>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, phone, city"
          aria-label="Search parties"
          className="min-h-[40px] sm:max-w-xs"
        />
        <label className="inline-flex items-center gap-2 text-sm text-[var(--text-body)]">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {filtered.length === 0 ? (
        <Card className="py-10 text-center text-sm text-[var(--text-muted)]">No parties yet.</Card>
      ) : (
        <Card className="divide-y divide-[var(--border-light)] p-0">
          {filtered.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold text-[var(--text-dark)]">{p.name}</p>
                <p className="truncate text-xs text-[var(--text-muted)]">
                  {[INVENTORY_PARTY_KIND_LABELS[p.kind], p.phone, p.city, p.gstin ? `GSTIN ${p.gstin}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {p.address && <p className="truncate text-xs text-[var(--text-muted)]">{p.address}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!p.is_active && <Badge variant="lost">Inactive</Badge>}
                <Button type="button" variant="secondary" className="min-h-[40px]" onClick={() => toggleActive(p)} disabled={pending}>
                  {p.is_active ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
