import { Suspense } from "react";
import { LandingForm } from "@/components/ads/landing-form";
import { ADS_LANDING, adsPhoneFromEnv } from "@/lib/ads/landing-copy";

export function AdLandingPage() {
  const phone = adsPhoneFromEnv();

  return (
    <div className="min-h-screen bg-[#f7f9fc] font-sans text-slate-800">
      {/* Hero + form */}
      <section className="relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ADS_LANDING.coverImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0 bg-[linear-gradient(160deg,rgba(30,57,112,0.92)_0%,rgba(49,88,166,0.86)_55%,rgba(30,57,112,0.9)_100%)]"
          aria-hidden
        />

        <div className="relative z-10 mx-auto max-w-6xl px-5 pb-10 pt-6 sm:px-8 sm:pb-14 sm:pt-8 lg:px-10 lg:pb-16">
          <header className="flex items-center justify-between gap-4">
            <p className="text-xl font-bold tracking-normal text-white sm:text-2xl">
              {ADS_LANDING.brand}
            </p>
            {phone ? (
              <a
                href={`tel:${phone.replace(/\s+/g, "")}`}
                className="rounded-lg border border-white/35 bg-white/15 px-3 py-2 text-sm font-semibold text-white"
              >
                {ADS_LANDING.ctaCall}
              </a>
            ) : null}
          </header>

          {/* Mobile: short intro → form early. Desktop: side-by-side. */}
          <div className="mt-6 grid gap-6 lg:mt-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-start lg:gap-12">
            <div className="max-w-xl">
              <p className="text-sm font-semibold text-[#ffc799]">{ADS_LANDING.coverTagline}</p>
              <h1 className="mt-2 text-[1.75rem] font-bold leading-snug tracking-normal text-white sm:text-3xl lg:text-4xl lg:leading-tight">
                {ADS_LANDING.headline}
              </h1>
              <p className="mt-3 text-base leading-relaxed text-white sm:text-lg">
                {ADS_LANDING.sub}
              </p>
              <div className="mt-5 hidden flex-wrap gap-3 lg:flex">
                <a
                  href="#enquiry"
                  className="rounded-lg bg-[#e87a1a] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#c96612]"
                >
                  {ADS_LANDING.ctaPrimary}
                </a>
                {phone ? (
                  <a
                    href={`tel:${phone.replace(/\s+/g, "")}`}
                    className="rounded-lg border border-white/40 bg-white/10 px-5 py-3 text-sm font-semibold text-white"
                  >
                    {phone}
                  </a>
                ) : null}
              </div>
            </div>

            <div className="w-full lg:max-w-md lg:justify-self-end">
              <Suspense
                fallback={<div className="h-72 rounded-xl border border-white/20 bg-white/90 animate-pulse" />}
              >
                <LandingForm />
              </Suspense>
            </div>
          </div>
        </div>
      </section>

      {/* Details below form */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-5 px-5 py-8 sm:grid-cols-2 sm:px-8 sm:py-10 lg:grid-cols-4 lg:px-10">
          {ADS_LANDING.services.map((service) => (
            <div key={service.title}>
              <p className="text-base font-bold text-[#3158a6]">{service.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{service.sub}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-12 lg:px-10">
        <h2 className="text-2xl font-bold tracking-normal text-[#1e3970] sm:text-3xl">
          Why homeowners choose solar
        </h2>
        <p className="mt-2 max-w-xl text-base leading-relaxed text-slate-600">
          {ADS_LANDING.trustLine}
        </p>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 sm:gap-4">
          {ADS_LANDING.benefits.map((benefit) => (
            <li
              key={benefit.label}
              className="border-l-4 border-[#e87a1a] bg-white px-4 py-3.5 text-base font-medium leading-snug text-slate-800 shadow-sm"
            >
              {benefit.label}
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <p className="font-semibold text-[#3158a6]">{ADS_LANDING.brand}</p>
          <p>{ADS_LANDING.poweredBy}</p>
        </div>
      </footer>
    </div>
  );
}
