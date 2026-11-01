"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { PoweredByDyzen } from "@/components/brand/powered-by-dyzen";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function PortalLookupForm({ initialCode = "" }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [phone, setPhone] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-[var(--border)] bg-white p-6 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        const c = code.trim().toUpperCase();
        const p = phone.replace(/\D/g, "").slice(-10);
        if (c.length < 4 || p.length < 10) return;
        startTransition(() => {
          router.push(`/portal/${encodeURIComponent(c)}?phone=${encodeURIComponent(p)}`);
        });
      }}
    >
      <div className="flex justify-center border-b border-[var(--border-light)] pb-4">
        <BrandMark imageClassName="w-56 sm:w-64" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-[var(--text-dark)]">Customer portal</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Enter the portal code from your installer and your registered mobile number.
          You can check status, upload documents, and raise complaints or service tickets.
        </p>
      </div>
      <div>
        <Label htmlFor="portal-code">Portal code</Label>
        <Input
          id="portal-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="e.g. RKAB12CD"
          required
          autoComplete="off"
        />
      </div>
      <div>
        <Label htmlFor="portal-phone">Mobile number</Label>
        <Input
          id="portal-phone"
          type="tel"
          inputMode="numeric"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="10-digit mobile"
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        Open portal
      </Button>
      <p className="text-center text-xs text-[var(--text-muted)]">
        Staff?{" "}
        <Link href="/login" className="font-semibold text-[var(--primary)]">
          Sign in
        </Link>
      </p>
      <PoweredByDyzen className="pt-2" />
    </form>
  );
}
