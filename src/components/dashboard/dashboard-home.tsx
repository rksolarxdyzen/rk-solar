import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ClipboardCheck,
  FileText,
  MapPin,
  Minus,
  Users,
} from "lucide-react";
import { NewLeadButton } from "@/components/leads/new-lead-button";
import { DashboardAttentionList } from "@/components/dashboard/dashboard-attention-list";
import { AccountsFinancePanel } from "@/components/dashboard/accounts-finance-panel";
import { BRAND } from "@/lib/brand";
import type { DashboardData, DashboardKpi, KpiTone } from "@/lib/dashboard/load-dashboard";
import { cn, formatCurrency } from "@/lib/utils";

const TONE: Record<KpiTone, { value: string; wash: string; ring: string }> = {
  neutral: {
    value: "text-[var(--text-dark)]",
    wash: "from-white to-[var(--primary-faint)]",
    ring: "border-[var(--border)]",
  },
  warn: {
    value: "text-[var(--warn)]",
    wash: "from-white to-[var(--warn-light)]",
    ring: "border-[var(--warn)]/25",
  },
  danger: {
    value: "text-[var(--error)]",
    wash: "from-white to-[var(--error-light)]",
    ring: "border-[var(--error)]/30",
  },
  success: {
    value: "text-[var(--success)]",
    wash: "from-white to-[var(--success-light)]",
    ring: "border-[var(--success)]/25",
  },
  accent: {
    value: "text-[var(--accent-hover)]",
    wash: "from-white to-[var(--accent-light)]",
    ring: "border-[var(--accent)]/30",
  },
};

function formatKpiValue(value: number, format: DashboardKpi["format"]) {
  if (format === "currency") return formatCurrency(value);
  if (format === "percent") return `${value}%`;
  return new Intl.NumberFormat("en-IN").format(value);
}

function MomChip({ pct }: { pct: number | null | undefined }) {
  if (pct == null) return null;
  const up = pct > 0;
  const flat = pct === 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
        flat && "bg-[var(--border-light)] text-[var(--text-muted)]",
        up && "bg-[var(--success-light)] text-[var(--success)]",
        !up && !flat && "bg-[var(--error-light)] text-[var(--error)]"
      )}
    >
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

function SnapshotStat({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href: string;
  accent?: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-white/50 bg-white/70 px-4 py-3 shadow-[var(--shadow)] backdrop-blur transition hover:-translate-y-0.5 hover:border-[var(--primary)]/30 hover:bg-white"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight",
          accent ?? "text-[var(--text-dark)]"
        )}
      >
        {value}
      </p>
      <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--primary)] opacity-0 transition group-hover:opacity-100">
        Open <ArrowUpRight className="h-3 w-3" />
      </span>
    </Link>
  );
}

function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  const tone = TONE[kpi.tone];
  return (
    <Link
      href={kpi.href}
      className={cn(
        "group flex flex-col rounded-2xl border bg-gradient-to-br p-4 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lg)]",
        tone.ring,
        tone.wash
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
          {kpi.label}
        </p>
        <div className="flex items-center gap-1.5">
          <MomChip pct={kpi.momPct} />
          <ArrowUpRight className="h-4 w-4 text-[var(--text-light)] opacity-0 transition group-hover:opacity-100" />
        </div>
      </div>
      <p className={cn("mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight", tone.value)}>
        {formatKpiValue(kpi.value, kpi.format)}
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{kpi.hint}</p>
      {kpi.secondary && (
        <p className="mt-2 text-sm text-[var(--text-body)]">
          <span className="font-semibold text-[var(--text-dark)]">
            {formatKpiValue(kpi.secondary.value, kpi.secondary.format ?? "number")}
          </span>{" "}
          <span className="text-[var(--text-muted)]">{kpi.secondary.label}</span>
        </p>
      )}
      {kpi.detail && (
        <p className="mt-auto pt-2 text-[11px] font-medium text-[var(--text-light)]">{kpi.detail}</p>
      )}
    </Link>
  );
}

export function DashboardHome({ data }: { data: DashboardData }) {
  const maxPipeline = Math.max(1, ...data.pipeline.map((c) => c.count));
  const maxPhase = Math.max(1, ...data.phases.map((p) => p.count));
  const maxSource = Math.max(1, ...data.sources.map((s) => s.total), 1);
  const dueReminders =
    data.reminders.overdue + data.reminders.dueNow + data.reminders.dueToday;

  return (
    <div className="space-y-8">
      <section className="dashboard-hero relative overflow-hidden rounded-3xl border border-[var(--border)] shadow-[var(--shadow-lg)]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 90% at 0% 0%, rgba(49,88,166,0.22), transparent 55%), radial-gradient(90% 80% at 100% 10%, rgba(255,168,0,0.18), transparent 50%), linear-gradient(145deg, #1d2d51 0%, #3158a6 48%, #274887 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute -right-8 top-0 h-full w-[42%] opacity-30"
          style={{
            background:
              "repeating-conic-gradient(from 210deg at 70% 40%, rgba(255,255,255,0.12) 0deg 8deg, transparent 8deg 18deg)",
            maskImage: "linear-gradient(90deg, transparent, black 30%)",
          }}
        />

        <div className="relative flex flex-col gap-8 p-6 sm:p-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl fade-slide-up">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              {BRAND.name}
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
              Welcome back, {data.name.split(" ")[0]}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/75">
              {data.roleLabel} · {data.dateLabel}. {data.activeTotal} active lead
              {data.activeTotal === 1 ? "" : "s"}
              {data.visitsToday > 0
                ? ` · ${data.visitsToday} site visit${data.visitsToday === 1 ? "" : "s"} today`
                : ""}
              .
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="[&_button]:bg-[var(--accent)] [&_button]:text-[var(--text-dark)] [&_button]:hover:bg-[var(--accent-hover)] [&_button]:hover:text-white">
                <NewLeadButton />
              </span>
              <Link
                href="/pipeline"
                className="inline-flex items-center justify-center rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                Open pipeline
              </Link>
              {data.canQuotations && (
                <Link
                  href="/quotations"
                  className="inline-flex items-center justify-center rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                >
                  Quotes
                </Link>
              )}
              {data.canIngest && (
                <Link
                  href="/ingest"
                  className="inline-flex items-center justify-center rounded-lg border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
                >
                  Ingest
                </Link>
              )}
            </div>
          </div>

          <div className="grid w-full max-w-lg grid-cols-2 gap-3 sm:grid-cols-4 lg:max-w-md fade-slide-up [animation-delay:80ms]">
            <SnapshotStat label="Pipeline" value={data.activeTotal} href="/pipeline" />
            <SnapshotStat
              label="Visits today"
              value={data.visitsToday}
              href="/pipeline"
              accent="text-[var(--accent-hover)]"
            />
            <SnapshotStat
              label="Customers"
              value={data.customerTotal}
              href="/customers"
              accent="text-[var(--success)]"
            />
            <SnapshotStat
              label="Alerts"
              value={dueReminders}
              href="/alerts"
              accent="text-[var(--warn)]"
            />
          </div>
        </div>
      </section>

      {/* Phase 1 KPI grid */}
      <section className="fade-slide-up [animation-delay:100ms]">
        <div className="mb-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-dark)]">
            Key metrics
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Month-to-date performance and queues you can act on
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.kpis.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>
      </section>

      {data.accountsFinance ? <AccountsFinancePanel data={data.accountsFinance} /> : null}

      <section className="fade-slide-up [animation-delay:120ms]">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-dark)]">
              Sales pipeline
            </h2>
            <p className="text-sm text-[var(--text-muted)]">
              From first contact through survey done
              {data.lostCount > 0 ? ` · ${data.lostCount} lost` : ""}
            </p>
          </div>
          <Link href="/pipeline" className="text-xs font-semibold text-[var(--primary)] hover:underline">
            Board →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.pipeline.map((col, index) => (
            <Link
              key={col.id}
              href="/pipeline"
              className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--primary)]/35 hover:shadow-[var(--shadow-lg)]"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", col.colorClass)} />
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                    {col.label}
                  </p>
                </div>
                <span className="text-[10px] font-semibold text-[var(--text-light)]">
                  {index + 1}/{data.pipeline.length}
                </span>
              </div>
              <p className="mt-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--text-dark)]">
                {col.count}
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--border-light)]">
                <div
                  className={cn("h-full rounded-full transition-all", col.colorClass)}
                  style={{ width: `${Math.max(8, (col.count / maxPipeline) * 100)}%` }}
                />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-8 fade-slide-up [animation-delay:160ms]">
          <DashboardAttentionList summary={data.reminders} items={data.attention} />

          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-dark)]">
                  Customer journey
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Won and post-sale fulfillment · {data.customerTotal} total
                </p>
              </div>
              <Link
                href="/customers"
                className="text-xs font-semibold text-[var(--primary)] hover:underline"
              >
                Customers →
              </Link>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)]">
              <div className="space-y-4">
                {data.phases.map((phase) => (
                  <Link key={phase.id} href="/customers" className="group block">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-[var(--text-body)] group-hover:text-[var(--primary)]">
                        {phase.label}
                      </span>
                      <span className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-dark)]">
                        {phase.count}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--border-light)]">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] transition-all"
                        style={{
                          width: `${Math.max(phase.count > 0 ? 6 : 0, (phase.count / maxPhase) * 100)}%`,
                        }}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-8 fade-slide-up [animation-delay:200ms]">
          <section className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)]">
            <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-dark)]">
              Jump in
            </h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Common next steps</p>
            <div className="mt-4 grid gap-2">
              {[
                {
                  href: "/pipeline",
                  label: "Work the pipeline",
                  icon: Users,
                  detail: `${data.surveyDone} survey done`,
                },
                {
                  href: "/customers",
                  label: "Customer workspace",
                  icon: MapPin,
                  detail: `${data.customerTotal} in fulfillment`,
                },
                {
                  href: "/alerts",
                  label: "Clear reminders",
                  icon: ClipboardCheck,
                  detail: `${data.reminders.total} open`,
                },
                ...(data.canQuotations
                  ? [
                      {
                        href: "/quotations",
                        label: "Quotations",
                        icon: FileText,
                        detail: "Build & print proposals",
                      },
                    ]
                  : []),
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition hover:border-[var(--border)] hover:bg-[var(--primary-faint)]"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--primary-light)] text-[var(--primary)]">
                    <item.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-[var(--text-dark)]">
                      {item.label}
                    </span>
                    <span className="block text-xs text-[var(--text-muted)]">{item.detail}</span>
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-[var(--text-light)]" />
                </Link>
              ))}
            </div>
          </section>

          {data.sources.length > 0 && (
            <section>
              <div className="mb-3 flex items-end justify-between gap-2">
                <div>
                  <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-dark)]">
                    Lead sources
                  </h2>
                  <p className="text-sm text-[var(--text-muted)]">Where demand is coming from</p>
                </div>
                {data.canIngest && (
                  <Link
                    href="/ingest"
                    className="text-xs font-semibold text-[var(--primary)] hover:underline"
                  >
                    Ingest →
                  </Link>
                )}
              </div>
              <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
                {data.sources.map((source) => (
                  <div key={source.source} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-semibold text-[var(--text-body)]">{source.label}</span>
                      <span className="tabular-nums text-[var(--text-dark)]">
                        <strong>{source.total}</strong>
                        <span className="ml-2 text-xs font-normal text-[var(--text-muted)]">
                          {source.active} active · {source.surveyCompleted} surveyed
                        </span>
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-light)]">
                      <div
                        className="h-full rounded-full bg-[var(--primary)]"
                        style={{ width: `${Math.max(6, (source.total / maxSource) * 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
