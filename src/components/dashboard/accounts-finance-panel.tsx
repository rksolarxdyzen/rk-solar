import Link from "next/link";
import type { AccountsFinanceBlock } from "@/lib/dashboard/load-dashboard";
import { formatCurrency } from "@/lib/utils";
import { receivablesHref } from "@/lib/accounts/receivables-buckets";

export function AccountsFinancePanel({ data }: { data: AccountsFinanceBlock }) {
  return (
    <section className="fade-slide-up [animation-delay:90ms]">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-dark)]">
            Accounts finance
          </h2>
          <p className="text-sm text-[var(--text-muted)]">
            Received vs pending by part · assigned salesperson on Receivables
          </p>
        </div>
        <Link
          href="/accounts/receivables"
          className="text-xs font-semibold text-[var(--primary)] hover:underline"
        >
          Receivables →
        </Link>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
          <Link
            href={receivablesHref("pending")}
            className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] hover:text-[var(--primary)]"
          >
            Pending ({data.pendingCustomers} customers) →
          </Link>
          <ul className="mt-3 space-y-2 text-sm">
            <Row
              label="Token"
              detail={`${data.pendingToken.count} files`}
              value={data.pendingToken.amount}
              href={receivablesHref("token")}
            />
            <Row
              label="Pre-dispatch"
              detail={`${data.pendingPreDispatch.count} files`}
              value={data.pendingPreDispatch.amount}
              href={receivablesHref("pre")}
            />
            <Row
              label="Final"
              detail={`${data.pendingFinal.count} files`}
              value={data.pendingFinal.amount}
              href={receivablesHref("final")}
            />
            <Row
              label="Company subsidy"
              detail={`${data.pendingSubsidy.count} · Won checkbox`}
              value={data.pendingSubsidy.amount}
              href={receivablesHref("subsidy")}
            />
          </ul>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Collected this month
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <Row label="Token" value={data.collectedMtd.token} />
            <Row label="Pre-dispatch" value={data.collectedMtd.pre_dispatch} />
            <Row label="Final" value={data.collectedMtd.final} />
          </ul>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Dealers
            </p>
            <Link href="/dealers" className="text-xs font-semibold text-[var(--primary)]">
              Open →
            </Link>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            <Row label="Shortly due" value={data.dealerShortlyDue} />
            <Row label="Paid this month" value={data.dealerPaidMonth} />
            <li className="flex justify-between gap-2 border-t border-[var(--border-light)] pt-2">
              <span className="text-[var(--text-muted)]">Avg / file (MTD)</span>
              <strong>
                {data.avgPaidPerFile == null ? "—" : formatCurrency(data.avgPaidPerFile)}
              </strong>
            </li>
            <li className="flex justify-between gap-2">
              <span className="text-[var(--text-muted)]">Avg / dealer (MTD)</span>
              <strong>
                {data.avgPaidPerDealer == null
                  ? "—"
                  : formatCurrency(data.avgPaidPerDealer)}
              </strong>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function Row({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: number;
  detail?: string;
  href?: string;
}) {
  const content = (
    <>
      <span>
        <span className="text-[var(--text-body)]">{label}</span>
        {detail ? (
          <span className="mt-0.5 block text-[0.65rem] text-[var(--text-muted)]">
            {detail}
          </span>
        ) : null}
      </span>
      <strong className="tabular-nums text-[var(--text-dark)]">
        {formatCurrency(value)}
      </strong>
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="-mx-2 flex items-start justify-between gap-2 rounded-lg px-2 py-1 transition hover:bg-[var(--primary-faint)]"
        >
          {content}
        </Link>
      ) : (
        <div className="flex items-start justify-between gap-2">{content}</div>
      )}
    </li>
  );
}
