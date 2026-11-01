"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { SoftLink } from "@/components/local-first/soft-link";
import { DealerMonthlyBoard } from "@/components/reports/dealer-monthly-board";
import {
  listDealerMonthlyReport,
  listDealerReportOptions,
} from "@/actions/dealer-report";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { canViewDealerMonthlyReport } from "@/lib/reports/dealer-monthly-types";

function parseMonthParam(raw: string | null): { year: number; month: number } {
  const now = new Date();
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(5, 7));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    year < 2000 ||
    year > 2100 ||
    month < 1 ||
    month > 12
  ) {
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return { year, month };
}

function DealersReportInner() {
  const { profile, authorities, companyId } = useLocalFirstSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const can = canViewDealerMonthlyReport(profile, new Set(authorities));
  const { year, month } = useMemo(
    () => parseMonthParam(searchParams.get("month")),
    [searchParams]
  );
  const dealerId = searchParams.get("dealer")?.trim() || "all";

  const { data, isPending } = useQuery({
    queryKey: ["rk", "dealer-report", companyId, year, month, dealerId] as const,
    queryFn: async () => {
      const [report, options] = await Promise.all([
        listDealerMonthlyReport({
          year,
          month,
          dealerId: dealerId === "all" ? null : dealerId,
        }).catch(() => ({
          year,
          month,
          rangeLabel: new Date(year, month - 1, 1).toLocaleString("en-IN", {
            month: "long",
            year: "numeric",
          }),
          rows: [],
          totals: {
            leadsSubmitted: 0,
            filesWon: 0,
            quotationsSubmitted: 0,
            bookedValue: 0,
          },
        })),
        listDealerReportOptions().catch(() => []),
      ]);
      return { report, options };
    },
    enabled: can,
  });

  useEffect(() => {
    if (!can) router.replace("/");
  }, [can, router]);

  if (!can) return null;
  if (isPending && !data) {
    return <div className="min-h-[40vh]" aria-busy="true" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports"
        title="Dealer report"
        subtitle="Monthly leads, won files, and quotations from external dealers. Attribution uses dealer link, then dealer-created leads."
        className="mb-0"
        actions={
          <SoftLink
            href="/dealers"
            className="text-sm font-semibold text-[var(--primary)] hover:underline"
          >
            Dealers directory
          </SoftLink>
        }
      />
      <DealerMonthlyBoard
        report={data!.report}
        options={data!.options}
        selectedDealerId={dealerId}
      />
    </div>
  );
}

export default function DealersReportPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}>
      <DealersReportInner />
    </Suspense>
  );
}
