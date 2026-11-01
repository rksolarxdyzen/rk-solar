"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { BRAND } from "@/lib/brand";

export function ReferralPublicForm({
  code,
  companyName,
  linkLabel,
}: {
  code: string;
  companyName: string;
  linkLabel?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const res = await fetch("/api/ingest/referral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            name: String(fd.get("name") ?? ""),
            phone: String(fd.get("phone") ?? ""),
            email: String(fd.get("email") ?? ""),
            city: String(fd.get("city") ?? ""),
            address: String(fd.get("address") ?? ""),
            requirement: String(fd.get("requirement") ?? ""),
            referrerName: String(fd.get("referrerName") ?? ""),
            referrerPhone: String(fd.get("referrerPhone") ?? ""),
          }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Could not submit");
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Submit failed");
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-[var(--success)]/30 bg-[var(--success-light)] p-6 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)]">
          Thank you
        </h2>
        <p className="mt-2 text-sm text-[var(--text-body)]">
          Our team at {companyName} will contact you shortly.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-6 shadow-[var(--shadow)]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
          {BRAND.shortName} · Referral
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text-dark)]">
          {linkLabel || `Get a solar quote from ${companyName}`}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Share your details and we will call you back.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" required placeholder="Customer name" />
        </div>
        <div>
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" required placeholder="10-digit mobile" />
        </div>
        <div>
          <Label htmlFor="email">Email (optional)</Label>
          <Input id="email" name="email" type="email" placeholder="you@example.com" />
        </div>
        <div>
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" placeholder="City" />
        </div>
        <div>
          <Label htmlFor="referrerName">Referred by (name)</Label>
          <Input id="referrerName" name="referrerName" placeholder="Friend / partner" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" name="address" placeholder="Site address" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="requirement">Requirement</Label>
          <Textarea id="requirement" name="requirement" rows={3} placeholder="e.g. 5 kW rooftop" />
        </div>
        <div>
          <Label htmlFor="referrerPhone">Referrer phone (optional)</Label>
          <Input id="referrerPhone" name="referrerPhone" placeholder="Referrer mobile" />
        </div>
      </div>

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}

      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Submitting…" : "Submit enquiry"}
      </Button>
    </form>
  );
}
