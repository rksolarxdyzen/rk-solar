"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PaymentsQueueClient } from "@/components/payments/payments-queue-client";
import { PageHeader } from "@/components/layout/page-header";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { hasAuth, roleIn } from "@/lib/local-first/access";
import { paymentsOptions } from "@/lib/local-first/queries";

export default function PaymentsPage() {
  const { profile, authorities, companyId } = useLocalFirstSession();
  const router = useRouter();
  const can =
    roleIn(profile, ["admin", "accounts", "sales_manager", "sales_executive"]) ||
    hasAuth(authorities, "view_payment_queues") ||
    hasAuth(authorities, "record_payment") ||
    hasAuth(authorities, "verify_payment");
  const canVerify =
    roleIn(profile, ["admin", "accounts"]) || hasAuth(authorities, "verify_payment");
  const canDelete = roleIn(profile, ["admin"]) || hasAuth(authorities, "full_access");

  const { data: rows = [], isPending } = useQuery(paymentsOptions(companyId));

  useEffect(() => {
    if (!can) router.replace("/pipeline");
  }, [can, router]);

  if (!can) return null;
  if (isPending && rows.length === 0) {
    return (
      <div className="min-h-[40vh]" aria-busy="true" aria-label="Loading payments" />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Others"
        title="Payments"
        subtitle="Accounts verifies txn ID, payment date, and bank credit for each milestone."
        className="mb-0"
      />
      <PaymentsQueueClient
        initialRows={rows as never}
        canVerify={canVerify}
        canDelete={canDelete}
      />
    </div>
  );
}
