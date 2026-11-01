import { queryOptions } from "@tanstack/react-query";
import { listLeads, listPovUsers, getCustomers } from "@/actions/leads";
import { listQuotations } from "@/actions/quotations";
import { listPaymentQueue } from "@/actions/payments";
import { listInstallationQueue } from "@/actions/installation";
import { listLiaisonQueue } from "@/actions/liaison";
import { listDealerDirectory } from "@/actions/dealers";
import { listServiceTickets } from "@/actions/tickets";
import { listTeamAccess } from "@/actions/team";
import { listGrievances } from "@/actions/grievances";
import { listCatalogAdmin } from "@/actions/catalog";
import { listAccountsReceivables } from "@/actions/accounts-receivables";
import { fetchDashboardData } from "@/actions/dashboard";
import { DASHBOARD_QUERY_STALE_MS } from "@/lib/local-first/query-client";
import type { PipelinePov } from "@/lib/leads/visibility";

export function dashboardOptions(companyId: string) {
  return queryOptions({
    queryKey: ["rk", "dashboard", companyId] as const,
    queryFn: () => fetchDashboardData(),
    staleTime: DASHBOARD_QUERY_STALE_MS,
  });
}

export function pipelineOptions(
  companyId: string,
  filters: {
    status?: "active" | "lost" | "all";
    queue?: "all" | "tele_call" | "site_visits";
    viewAs?: PipelinePov | null;
  }
) {
  return queryOptions({
    queryKey: ["rk", "pipeline", companyId, filters] as const,
    queryFn: async () => {
      const [activeLeads, lostLeads, povUsers] = await Promise.all([
        listLeads({
          status: "active",
          queue: filters.queue ?? "all",
          viewAs: filters.viewAs,
        }),
        listLeads({
          status: "lost",
          queue: filters.queue ?? "all",
          viewAs: filters.viewAs,
        }),
        listPovUsers(),
      ]);
      return { activeLeads, lostLeads, povUsers };
    },
  });
}

export function customersOptions(
  companyId: string,
  viewAs?: PipelinePov | null
) {
  return queryOptions({
    queryKey: ["rk", "customers", companyId, viewAs ?? null] as const,
    queryFn: async () => {
      const [customers, povUsers] = await Promise.all([
        getCustomers(viewAs),
        listPovUsers(),
      ]);
      return { customers, povUsers };
    },
  });
}

export function quotationsOptions(companyId: string) {
  return queryOptions({
    queryKey: ["rk", "quotations", companyId] as const,
    queryFn: () => listQuotations(),
  });
}

export function paymentsOptions(companyId: string) {
  return queryOptions({
    queryKey: ["rk", "payments", companyId] as const,
    queryFn: () => listPaymentQueue("pending"),
  });
}

export function installationOptions(companyId: string) {
  return queryOptions({
    queryKey: ["rk", "installation", companyId] as const,
    queryFn: () => listInstallationQueue(),
  });
}

export function liaisonOptions(companyId: string) {
  return queryOptions({
    queryKey: ["rk", "liaison", companyId] as const,
    queryFn: () => listLiaisonQueue(),
  });
}

export function dealersOptions(companyId: string) {
  return queryOptions({
    queryKey: ["rk", "dealers", companyId] as const,
    queryFn: () => listDealerDirectory(),
  });
}

export function maintenanceOptions(companyId: string) {
  return queryOptions({
    queryKey: ["rk", "maintenance", companyId] as const,
    queryFn: () => listServiceTickets(),
  });
}

export function teamOptions(companyId: string) {
  return queryOptions({
    queryKey: ["rk", "team", companyId] as const,
    queryFn: () => listTeamAccess(),
  });
}

export function grievancesOptions(companyId: string) {
  return queryOptions({
    queryKey: ["rk", "grievances", companyId] as const,
    queryFn: () => listGrievances(),
  });
}

export function catalogOptions(companyId: string) {
  return queryOptions({
    queryKey: ["rk", "catalog", companyId] as const,
    queryFn: () => listCatalogAdmin(),
  });
}

export function receivablesOptions(companyId: string) {
  return queryOptions({
    queryKey: ["rk", "receivables", companyId] as const,
    queryFn: () => listAccountsReceivables(),
  });
}
