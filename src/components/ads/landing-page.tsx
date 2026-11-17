import { Suspense } from "react";
import { LandingForm } from "@/components/ads/landing-form";
import { ADS_LANDING, adsPhoneFromEnv } from "@/lib/ads/landing-copy";

export function AdLandingPage() {
  const phone = adsPhoneFromEnv();

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <section className="relative min-h-[100svh] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={ADS_LANDING.coverImage}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          className="absolute inset-0 bg-[linear-gradient(105deg,rgba(30,57,112,0.88)_0%,rgba(49,88,166,0.72)_48%,rgba(30,57,112,0.45)_100%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
          aria-hidden
        />

        <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col px-5 pb-10 pt-8 sm:px-8 lg:px-10">
          <header className="flex items-center justify-between gap-4">
            <p className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {ADS_LANDING.brand}
            </p>
            {phone ? (
              <a
                href={`tel:${phone.replace(/\s+/g, "")}`}
                className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                {ADS_LANDING.ctaCall}
              </a>
            ) : null}
          </header>

          <div className="mt-10 grid flex-1 items-end gap-10 lg:mt-0 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="max-w-xl animate-[fadeSlideUp_0.7s_ease-out]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#ffc799]">
                {ADS_LANDING.coverTagline}
              </p>
              <h1 className="mt-3 font-[family-name:var(--font-display)] text-[clamp(2.1rem,5vw,3.6rem)] font-semibold leading-[1.08] tracking-tight text-white">
                {ADS_LANDING.headline}
              </h1>
              <p className="mt-4 max-w-md text-base leading-relaxed text-white/85 sm:text-lg">
                {ADS_LANDING.sub}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a
                  href="#enquiry"
                  className="rounded-xl bg-[#e87a1a] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-orange-900/20 transition hover:bg-[#c96612]"
                >
                  {ADS_LANDING.ctaPrimary}
                </a>
                {phone ? (
                  <a
                    href={`tel:${phone.replace(/\s+/g, "")}`}
                    className="rounded-xl border border-white/35 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                  >
                    {phone}
                  </a>
                ) : null}
              </div>
            </div>

            <div className="animate-[fadeSlideUp_0.85s_ease-out] lg:justify-self-end lg:w-full lg:max-w-md">
              <Suspense
                fallback={
                  <div className="h-80 rounded-2xl border border-white/20 bg-white/80 animate-pulse" />
                }
              >
                <LandingForm />
              </Suspense>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200/80 bg-white">
        <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 sm:grid-cols-2 sm:px-8 lg:grid-cols-4 lg:px-10">
          {ADS_LANDING.services.map((service) => (
            <div key={service.title} className="text-center sm:text-left">
              <p className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-wide text-[#3158a6]">
                {service.title}
              </p>
              <p className="mt-1 text-sm text-slate-600">{service.sub}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:px-10">
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[#1e3970]">
          Why homeowners choose solar
        </h2>
        <p className="mt-2 max-w-xl text-sm text-slate-600">{ADS_LANDING.trustLine}</p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {ADS_LANDING.benefits.map((benefit) => (
            <li
              key={benefit.label}
              className="border-l-4 border-[#e87a1a] bg-white px-5 py-4 text-base font-semibold text-[#1e3970] shadow-sm"
            >
              {benefit.label}
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
          <p className="font-semibold text-[#3158a6]">{ADS_LANDING.brand}</p>
          <p>{ADS_LANDING.poweredBy}</p>
        </div>
      </footer>

      <a
        href="#enquiry"
        className="fixed bottom-4 left-4 right-4 z-20 rounded-xl bg-[#e87a1a] px-4 py-3 text-center text-sm font-bold text-white shadow-lg sm:hidden"
      >
        {ADS_LANDING.ctaPrimary}
      </a>

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
