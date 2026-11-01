import { Suspense } from "react";
import { getCustomers, listPovUsers } from "@/actions/leads";
import {
  CustomersList,
  type CustomerRow,
} from "@/components/leads/customers-list";
import { PageHeader } from "@/components/layout/page-header";
import type { SalesStage } from "@/lib/domain/workflow";
import { parsePipelinePov, povSubtitle } from "@/lib/leads/visibility";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ as?: string; as_role?: string }>;
}) {
  const sp = await searchParams;
  const povUsers = await listPovUsers();
  const viewAs = povUsers.length > 0 ? parsePipelinePov(sp.as, sp.as_role) : null;
  const customers = await getCustomers(viewAs);
  const povLabel = povSubtitle(viewAs, povUsers);

  const rows: CustomerRow[] = customers.map((customer) => ({
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
      customer.telecaller_profile?.name ?? customer.assigned_profile?.name ?? null,
    surveyor_name: customer.surveyor_profile?.name ?? null,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Leads"
        title="Customers"
        subtitle={
          povLabel
            ? `${povLabel} ┬╖ ${rows.length} customer${rows.length === 1 ? "" : "s"}`
            : `Won through post-sale ┬╖ ${rows.length} total. Quoted files stay on the Leads board. Installation jobs open in their own workspace.`
        }
        className="mb-0"
      />
      <Suspense fallback={null}>
        <CustomersList customers={rows} povUsers={povUsers} />
      </Suspense>
    </div>
  );
}
