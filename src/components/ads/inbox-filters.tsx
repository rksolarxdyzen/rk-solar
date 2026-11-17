"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export function AdsInboxFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");

  function apply(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    startTransition(() => {
      router.push(`/ads?${params.toString()}`);
    });
  }

  const exportHref = `/ads/export?${searchParams.toString()}`;

  return (
    <form onSubmit={apply} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-end">
      <label className="flex-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Search
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name or phone"
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#3158a6]"
        />
      </label>
      <label className="w-full text-xs font-semibold uppercase tracking-wider text-slate-500 lg:w-40">
        Status
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#3158a6]"
        >
          <option value="">All</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="junk">Junk</option>
        </select>
      </label>
      <label className="w-full text-xs font-semibold uppercase tracking-wider text-slate-500 lg:w-40">
        From
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#3158a6]"
        />
      </label>
      <label className="w-full text-xs font-semibold uppercase tracking-wider text-slate-500 lg:w-40">
        To
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal outline-none focus:border-[#3158a6]"
        />
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[#3158a6] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          Apply
        </button>
        <a
          href={exportHref}
          className="rounded-xl border border-[#e87a1a] bg-[#fff4eb] px-4 py-2 text-sm font-bold text-[#a6530e]"
        >
          Export CSV
        </a>
      </div>
    </form>
  );
}
