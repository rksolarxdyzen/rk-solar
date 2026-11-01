"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, Lock, Eye, EyeOff, ArrowRight, PhoneCall, MapPin, ShieldCheck } from "lucide-react";
import { signIn } from "@/actions/auth";
import { BrandMark } from "@/components/brand/brand-mark";
import { PoweredByDyzen } from "@/components/brand/powered-by-dyzen";
import { InstallAppButton } from "@/components/pwa/install-app-button";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

const ERROR_HINTS: Record<string, string> = {
  auth_callback_failed: "Sign-in link expired or was invalid. Please try again.",
  profile_missing:
    "Your account signed in but has no profile. Ask an admin to provision your user.",
};

const FEATURES = [
  { icon: PhoneCall, label: "Tele-calling to field survey handoff" },
  { icon: MapPin, label: "Site surveys, quotes, install & Discom" },
  { icon: ShieldCheck, label: "Strict RBAC across every milestone" },
];

export default function LoginPage() {
  const searchParams = useSearchParams();
  const queryError = searchParams.get("error");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, startTransition] = useTransition();

  const displayError =
    error ||
    (queryError ? (ERROR_HINTS[queryError] ?? "Sign in failed. Please try again.") : "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      const result = await signIn(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="flex min-h-screen bg-white">
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-[radial-gradient(ellipse_at_top_left,_#4a70bc_0%,_#3158a6_45%,_#1e3970_100%)] p-12 text-white lg:flex">
        <div
          className="pointer-events-none absolute -right-20 top-24 h-72 w-72 rounded-full bg-[var(--accent)] opacity-20 blur-[90px]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
          aria-hidden
        />

        <div className="relative z-10 rounded-xl bg-white/95 px-5 py-3 shadow-lg">
          <BrandMark imageClassName="w-64 sm:w-72" />
        </div>

        <div className="relative z-10 fade-slide-up">
          <h2 className="max-w-sm font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight tracking-tight">
            Power RK operations from lead to maintenance.
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/75">
            {BRAND.productLine}
          </p>
          <ul className="mt-8 space-y-3.5">
            {FEATURES.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-start gap-3 text-sm text-white/90">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                  <Icon className="h-3.5 w-3.5 text-[var(--accent)]" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 space-y-1.5">
          <p className="text-xs font-medium text-white/45">
            © {new Date().getFullYear()} {BRAND.name}
          </p>
          <PoweredByDyzen tone="onDark" className="text-left" />
        </div>
      </div>

      <div className="flex w-full flex-1 flex-col items-center justify-center px-6 py-12 sm:px-10">
        <div className="w-full max-w-sm fade-slide-up">
          <div className="mb-9 flex flex-col items-center text-center lg:hidden">
            <BrandMark imageClassName="w-64" />
          </div>

          <div className="mb-8 hidden lg:block">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
              Welcome back
            </p>
            <h1 className="mt-1.5 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-dark)]">
              Sign in to your account
            </h1>
          </div>

          <div className="mb-8 text-center lg:hidden">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[var(--text-dark)]">
              Sign in to your account
            </h1>
          </div>

          {displayError && (
            <div className="mb-5 rounded-lg border border-red-200 bg-[var(--error-light)] px-3.5 py-2.5 text-sm text-[var(--error)]">
              {displayError}
            </div>
          )}

          <form method="post" onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[0.69rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@rksolar.local"
                  className="w-full rounded-xl border border-[var(--border)] bg-white py-2.5 pl-10 pr-3 text-sm text-[var(--text-dark)] outline-none transition focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_rgba(15,92,76,0.12)] placeholder:text-[var(--text-muted)]"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-[0.69rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-[var(--border)] bg-white py-2.5 pl-10 pr-10 text-sm text-[var(--text-dark)] outline-none transition focus:border-[var(--primary)] focus:shadow-[0_0_0_3px_rgba(15,92,76,0.12)] placeholder:text-[var(--text-muted)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] transition hover:text-[var(--text-body)]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={pending}
              className={cn("group mt-2 w-full")}
            >
              {pending ? (
                "Signing in..."
              ) : (
                <>
                  Sign In
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-8">
            <InstallAppButton fullWidth size="md" showHelpTip alwaysVisible />
          </div>

          <PoweredByDyzen className="mt-10" />
        </div>
      </div>
    </div>
  );
}
