"use client";

import { useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { ADS_LANDING } from "@/lib/ads/landing-copy";
import { CAPACITY_INTERESTS } from "@/lib/ads/types";

const fieldClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800 outline-none transition focus:border-[#3158a6] focus:shadow-[0_0_0_3px_rgba(49,88,166,0.15)]";

const labelClass = "mb-1 block text-sm font-medium text-slate-700";

export function LandingForm() {
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const hidden = useMemo(
    () => ({
      campaign: searchParams.get("campaign") ?? "",
      utmSource: searchParams.get("utm_source") ?? "",
      utmMedium: searchParams.get("utm_medium") ?? "",
      utmCampaign: searchParams.get("utm_campaign") ?? "",
      utmContent: searchParams.get("utm_content") ?? "",
      utmTerm: searchParams.get("utm_term") ?? "",
      gclid: searchParams.get("gclid") ?? "",
      fbclid: searchParams.get("fbclid") ?? "",
    }),
    [searchParams]
  );

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        const res = await fetch("/api/ads/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: String(fd.get("name") ?? ""),
            phone: String(fd.get("phone") ?? ""),
            email: String(fd.get("email") ?? ""),
            city: String(fd.get("city") ?? ""),
            capacityInterest: String(fd.get("capacityInterest") ?? ""),
            message: String(fd.get("message") ?? ""),
            website: String(fd.get("website") ?? ""),
            ...hidden,
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
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center shadow-lg">
        <p className="text-sm font-semibold text-[#e87a1a]">{ADS_LANDING.shortBrand}</p>
        <h2 className="mt-2 text-2xl font-bold text-[#1e3970]">{ADS_LANDING.successTitle}</h2>
        <p className="mt-2 text-base text-slate-600">{ADS_LANDING.successBody}</p>
      </div>
    );
  }

  return (
    <form
      id="enquiry"
      onSubmit={onSubmit}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-lg sm:p-6"
    >
      <p className="text-sm font-semibold text-[#3158a6]">Free consultation</p>
      <h2 className="mt-1 text-xl font-bold text-[#1e3970] sm:text-2xl">{ADS_LANDING.formTitle}</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{ADS_LANDING.formSub}</p>

      {error ? (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={labelClass}>Name *</span>
          <input name="name" required autoComplete="name" className={fieldClass} />
        </label>
        <label className="block">
          <span className={labelClass}>Mobile *</span>
          <input
            name="phone"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="10-digit mobile"
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>City</span>
          <input name="city" autoComplete="address-level2" className={fieldClass} />
        </label>
        <label className="block sm:col-span-2">
          <span className={labelClass}>System size</span>
          <select name="capacityInterest" defaultValue="" className={fieldClass}>
            {CAPACITY_INTERESTS.map((opt) => (
              <option key={opt.value || "unset"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className={labelClass}>Message</span>
          <textarea name="message" rows={3} className={`${fieldClass} resize-none`} />
        </label>
        <label className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="mt-4 w-full rounded-lg bg-[#e87a1a] px-4 py-3 text-base font-semibold text-white transition hover:bg-[#c96612] disabled:opacity-60"
      >
        {pending ? "Sending…" : ADS_LANDING.ctaPrimary}
      </button>
    </form>
  );
}
