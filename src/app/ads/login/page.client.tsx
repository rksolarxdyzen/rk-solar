"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { signInAds } from "@/actions/ads-auth";
import { BRAND } from "@/lib/brand";

export default function AdsLoginPage() {
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signInAds(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(160deg,#E8F0FA_0%,#ffffff_45%,#fff4eb_100%)] px-5 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3158a6]">
          Ad enquiries only
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[#1e3970]">
          {BRAND.name}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Sign in to review landing-page submissions and export CSV.
        </p>

        {error ? (
          <div className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <form method="post" onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-[0.69rem] font-semibold uppercase tracking-wider text-slate-500"
            >
              Email
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-[#3158a6] focus:shadow-[0_0_0_3px_rgba(49,88,166,0.12)]"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[0.69rem] font-semibold uppercase tracking-wider text-slate-500"
            >
              Password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm outline-none transition focus:border-[#3158a6] focus:shadow-[0_0_0_3px_rgba(49,88,166,0.12)]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-[#3158a6] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e3970] disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
