"use client";

import { Suspense, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
  CustomersList,
  type CustomerRow,
} from "@/components/leads/customers-list";
import { PageHeader } from "@/components/layout/page-header";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { customersOptions } from "@/lib/local-first/queries";
import { parsePipelinePov, povSubtitle } from "@/lib/leads/visibility";
import type { SalesStage } from "@/lib/domain/workflow";

function CustomersInner() {
  const { companyId } = useLocalFirstSession();
  const searchParams = useSearchParams();
  const { data, isPending } = useQuery(customersOptions(companyId, null));

  const povUsers = data?.povUsers ?? [];
  const viewAs =
    povUsers.length > 0
      ? parsePipelinePov(
          searchParams.get("as") ?? undefined,
          searchParams.get("as_role") ?? undefined
        )
      : null;

  const scoped = useQuery({
    ...customersOptions(companyId, viewAs),
    enabled: Boolean(data),
    placeholderData: data,
  });

  const customers = scoped.data?.customers ?? data?.customers ?? [];
  const povLabel = povSubtitle(viewAs, povUsers);

  const rows: CustomerRow[] = useMemo(
    () =>
      customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        city: customer.city,
        address: customer.address,
        requirement_notes: customer.requirement_notes,
        sales_stage: customer.sales_stage as SalesStage,
        portal_code: customer.portal_code ?? null,
        created_at: customer.created_at,
        telecaller_name:
          customer.telecaller_profile?.name ??
          customer.assigned_profile?.name ??
          null,
        surveyor_name: customer.surveyor_profile?.name ?? null,
      })),
    [customers]
  );

  if (isPending && !data) {
    return (
      <div className="min-h-[40vh]" aria-busy="true" aria-label="Loading customers" />
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Leads"
        title="Customers"
        subtitle={
          povLabel
            ? `${povLabel} · ${rows.length} customer${rows.length === 1 ? "" : "s"}`
            : `Won through post-sale · ${rows.length} total. Quoted files stay on the Leads board. Installation jobs open in their own workspace.`
        }
        className="mb-0"
      />
      <Suspense fallback={null}>
        <CustomersList customers={rows} povUsers={povUsers} />
      </Suspense>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh]" aria-busy="true" aria-label="Loading customers" />
      }
    >
      <CustomersInner />
    </Suspense>
  );
}
