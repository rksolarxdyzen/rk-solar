"use client";

import { useQuery } from "@tanstack/react-query";
import {
  listServiceEngineers,
  listServiceTickets,
} from "@/actions/tickets";
import { getCustomers } from "@/actions/leads";
import { MaintenanceWorkspace } from "@/components/maintenance/maintenance-workspace";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { hasAuth, roleIn } from "@/lib/local-first/access";

export default function MaintenancePage() {
  const { profile, authorities, companyId } = useLocalFirstSession();
  const canView =
    roleIn(profile, [
      "admin",
      "service_engineer",
      "service_supervisor",
      "sales_manager",
    ]) || hasAuth(authorities, "view_service_tickets");
  const canAccept =
    roleIn(profile, ["admin", "service_engineer", "service_supervisor"]) ||
    hasAuth(authorities, "accept_service_ticket");
  const canResolve =
    roleIn(profile, ["admin", "service_engineer", "service_supervisor"]) ||
    hasAuth(authorities, "resolve_service_ticket");
  const canForceAssign =
    roleIn(profile, ["admin", "service_supervisor"]) ||
    hasAuth(authorities, "force_assign_service_ticket");
  const canEnqueueCleaning =
    roleIn(profile, ["admin", "service_supervisor"]) ||
    hasAuth(authorities, "enqueue_cleaning_reminders");

  const ticketsQ = useQuery({
    queryKey: ["rk", "maintenance", companyId] as const,
    queryFn: () => listServiceTickets(),
    enabled: canView,
    retry: false,
  });
  const engineersQ = useQuery({
    queryKey: ["rk", "maintenance-engineers", companyId] as const,
    queryFn: () => listServiceEngineers(),
    enabled: canView && canForceAssign,
  });
  const customersQ = useQuery({
    queryKey: ["rk", "customers", companyId, null] as const,
    queryFn: async () => {
      const customers = await getCustomers();
      return customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
      }));
    },
    enabled: canView && !ticketsQ.isError,
  });

  if (!canView) {
    return (
      <p className="rounded-xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--text-muted)]">
        You do not have access to maintenance tickets.
      </p>
    );
  }

  if (ticketsQ.isError) {
    const message =
      ticketsQ.error instanceof Error
        ? ticketsQ.error.message
        : String(ticketsQ.error);
    if (
      message.includes("service_tickets") ||
      message.includes("schema cache") ||
      message.includes("does not exist")
    ) {
      return (
        <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error-light)] p-6 text-sm text-[var(--text-dark)]">
          <p className="font-semibold">Maintenance schema not applied</p>
          <p className="mt-2 text-[var(--text-body)]">
            Run Supabase migrations{" "}
            <code className="rounded bg-white px-1.5 py-0.5 text-xs">
              011_maintenance.sql
            </code>{" "}
            and{" "}
            <code className="rounded bg-white px-1.5 py-0.5 text-xs">
              012_proofs_storage.sql
            </code>
            , then refresh.
          </p>
        </div>
      );
    }
  }

  if (ticketsQ.isPending && !ticketsQ.data) {
    return <div className="min-h-[40vh]" aria-busy="true" />;
  }

  return (
    <MaintenanceWorkspace
      tickets={
        (ticketsQ.data ?? []) as Parameters<
          typeof MaintenanceWorkspace
        >[0]["tickets"]
      }
      engineers={engineersQ.data ?? []}
      customers={customersQ.data ?? []}
      companyId={profile.company_id}
      profileId={profile.id}
      canAccept={canAccept}
      canResolve={canResolve}
      canForceAssign={canForceAssign}
      canEnqueueCleaning={canEnqueueCleaning}
      canRaiseTicket={canView}
    />
  );
}
