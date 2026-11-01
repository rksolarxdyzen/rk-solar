"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ReceivablesBoard } from "@/components/accounts/receivables-board";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { hasAuth, roleIn } from "@/lib/local-first/access";
import { receivablesOptions } from "@/lib/local-first/queries";
import { parseReceivablesBucket } from "@/lib/accounts/receivables-buckets";

function ReceivablesInner() {
  const { profile, authorities, companyId } = useLocalFirstSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bucket = searchParams.get("bucket") ?? undefined;
  const can =
    roleIn(profile, ["admin", "accounts", "sales_manager"]) ||
    hasAuth(authorities, "view_payment_queues") ||
    hasAuth(authorities, "verify_payment");

  const { data: rows = [], isPending } = useQuery({
    ...receivablesOptions(companyId),
    enabled: can,
  });

  useEffect(() => {
    if (!can) router.replace("/");
  }, [can, router]);

  if (!can) return null;
  if (isPending && rows.length === 0) {
    return <div className="min-h-[40vh]" aria-busy="true" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accounts"
        title="Receivables"
        subtitle="Every Won customer — received vs pending for Token, Pre-dispatch, Final, and company subsidy, plus assigned salesperson."
        className="mb-0"
      />
      <ReceivablesBoard
        key={bucket ?? "all"}
        rows={rows}
        initialBucket={parseReceivablesBucket(bucket)}
      />
    </div>
  );
}

export default function ReceivablesPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}>
      <ReceivablesInner />
    </Suspense>
  );
}
