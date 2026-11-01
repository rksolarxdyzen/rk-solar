"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { SalesRepMonthlyBoard } from "@/components/reports/sales-rep-monthly-board";
import {
  listSalesRepMonthlyReport,
  listSalesRepOptions,
} from "@/actions/sales-rep-report";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { canViewSalesRepReport } from "@/lib/reports/sales-rep-monthly-types";

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

function SalesRepsInner() {
  const { profile, authorities, companyId } = useLocalFirstSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const can = canViewSalesRepReport(profile, new Set(authorities));
  const { year, month } = useMemo(
    () => parseMonthParam(searchParams.get("month")),
    [searchParams]
  );
  const salesRepId = searchParams.get("rep")?.trim() || "all";

  const { data, isPending } = useQuery({
    queryKey: ["rk", "sales-rep-report", companyId, year, month, salesRepId] as const,
    queryFn: async () => {
      const [report, options] = await Promise.all([
        listSalesRepMonthlyReport({
          year,
          month,
          salesRepId: salesRepId === "all" ? null : salesRepId,
        }).catch(() => ({
          year,
          month,
          rangeLabel: new Date(year, month - 1, 1).toLocaleString("en-IN", {
            month: "long",
            year: "numeric",
          }),
          rows: [],
          totals: {
            closedDeals: 0,
            bookedValue: 0,
            paymentsRecorded: 0,
            paymentsVerified: 0,
          },
        })),
        listSalesRepOptions().catch(() => []),
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
        title="Sales report"
        subtitle="Closed deals and payments by sales rep for the selected month. Attribution uses tele-caller, then Assigned To."
        className="mb-0"
      />
      <SalesRepMonthlyBoard
        report={data!.report}
        options={data!.options}
        selectedRepId={salesRepId}
      />
    </div>
  );
}

export default function SalesRepsReportPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}>
      <SalesRepsInner />
    </Suspense>
  );
}
