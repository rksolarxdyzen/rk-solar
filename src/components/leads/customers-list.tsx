"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  HardHat,
  Search,
  Wallet,
} from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { ViewAsPicker, type PovUser } from "@/components/leads/view-as-picker";
import {
  CUSTOMER_PHASES,
  CUSTOMER_SALES_STAGES,
  SALES_STAGE_LABELS,
  isInstallationCustomerStage,
  type CustomerPhaseId,
  type SalesStage,
} from "@/lib/domain/workflow";
import { loadListState, saveListState } from "@/lib/local-first/list-state";
import { usePrefetchLeadDetail } from "@/lib/leads/use-prefetch-lead-detail";
import { useVisibleLeadPrefetch } from "@/lib/leads/use-visible-lead-prefetch";
import { cn, formatDateTime, formatPhone } from "@/lib/utils";

export type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  address: string | null;
  requirement_notes: string | null;
  sales_stage: SalesStage;
  portal_code?: string | null;
  created_at: string | null;
  telecaller_name?: string | null;
  surveyor_name?: string | null;
};

type SortKey = "created_desc" | "created_asc" | "name_asc" | "name_desc" | "stage_asc";
type PhaseFilter = "all" | CustomerPhaseId;

type CustomersListState = {
  query: string;
  phaseFilter: PhaseFilter;
  stageFilter: SalesStage | "all";
  cityFilter: string;
  sortKey: SortKey;
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "stage_asc", label: "Stage" },
];

const PHASE_ICONS: Record<CustomerPhaseId, typeof Wallet> = {
  payments: Wallet,
  installation: HardHat,
  liaison: Building2,
  completed: CheckCircle2,
};

function assignedLabel(customer: CustomerRow) {
  return (
    [
      customer.telecaller_name && `TC: ${customer.telecaller_name}`,
      customer.surveyor_name && `SV: ${customer.surveyor_name}`,
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function stagesForPhase(phase: PhaseFilter): SalesStage[] | null {
  if (phase === "all") return null;
  return CUSTOMER_PHASES.find((item) => item.id === phase)?.stages ?? null;
}

export function CustomersList({
  customers,
  povUsers = [],
}: {
  customers: CustomerRow[];
  povUsers?: PovUser[];
}) {
  const saved = loadListState<CustomersListState>("customers");
  const [query, setQuery] = useState(saved?.query ?? "");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>(
    saved?.phaseFilter ?? "all"
  );
  const [stageFilter, setStageFilter] = useState<SalesStage | "all">(
    saved?.stageFilter ?? "all"
  );
  const [cityFilter, setCityFilter] = useState(saved?.cityFilter ?? "all");
  const [sortKey, setSortKey] = useState<SortKey>(
    saved?.sortKey ?? "created_desc"
  );
  const { openInstallation, openCustomer } = useLeadModal();
  const prefetchLead = usePrefetchLeadDetail();
  const prefetchRootRef = useVisibleLeadPrefetch(customers.length);

  useEffect(() => {
    saveListState<CustomersListState>("customers", {
      query,
      phaseFilter,
      stageFilter,
      cityFilter,
      sortKey,
    });
  }, [query, phaseFilter, stageFilter, cityFilter, sortKey]);

  const cities = useMemo(() => {
    const unique = new Set(
      customers
        .map((customer) => customer.city?.trim())
        .filter((city): city is string => Boolean(city))
    );
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [customers]);

  const phaseCounts = useMemo(() => {
    const counts = Object.fromEntries(
      CUSTOMER_PHASES.map((phase) => [phase.id, 0])
    ) as Record<CustomerPhaseId, number>;
    for (const customer of customers) {
      const phase = CUSTOMER_PHASES.find((item) =>
        item.stages.includes(customer.sales_stage)
      );
      if (phase) counts[phase.id] += 1;
    }
    return counts;
  }, [customers]);

  const stageOptions = stagesForPhase(phaseFilter) ?? CUSTOMER_SALES_STAGES;

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    const phoneDigits = query.replace(/\D/g, "");
    const phaseStages = stagesForPhase(phaseFilter);

    const rows = customers.filter((customer) => {
      if (phaseStages && !phaseStages.includes(customer.sales_stage)) return false;
      if (stageFilter !== "all" && customer.sales_stage !== stageFilter) return false;
      if (cityFilter !== "all" && (customer.city ?? "") !== cityFilter) return false;
      if (!value) return true;

      const phoneMatch =
        customer.phone.includes(value) ||
        (phoneDigits.length >= 2 &&
          customer.phone.replace(/\D/g, "").includes(phoneDigits));
      return (
        customer.name.toLowerCase().includes(value) ||
        phoneMatch ||
        (customer.city?.toLowerCase().includes(value) ?? false) ||
        (customer.address?.toLowerCase().includes(value) ?? false) ||
        (customer.requirement_notes?.toLowerCase().includes(value) ?? false) ||
        (customer.portal_code?.toLowerCase().includes(value) ?? false) ||
        assignedLabel(customer).toLowerCase().includes(value)
      );
    });

    const stageOrder = CUSTOMER_SALES_STAGES;
    rows.sort((a, b) => {
      if (sortKey === "name_asc") return a.name.localeCompare(b.name);
      if (sortKey === "name_desc") return b.name.localeCompare(a.name);
      if (sortKey === "stage_asc") {
        return stageOrder.indexOf(a.sales_stage) - stageOrder.indexOf(b.sales_stage);
      }
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortKey === "created_asc" ? aTime - bTime : bTime - aTime;
    });

    return rows;
  }, [customers, query, phaseFilter, stageFilter, cityFilter, sortKey]);

  function setPhase(next: PhaseFilter) {
    setPhaseFilter(next);
    setStageFilter("all");
  }

  function openCustomerRecord(customer: CustomerRow) {
    const shell = {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      sales_stage: customer.sales_stage,
      city: customer.city,
      address: customer.address,
      requirement_notes: customer.requirement_notes,
      created_at: customer.created_at,
      telecaller_name: customer.telecaller_name,
      surveyor_name: customer.surveyor_name,
    };
    if (isInstallationCustomerStage(customer.sales_stage)) {
      openInstallation(customer.id, shell);
      return;
    }
    openCustomer(customer.id, shell);
  }

  const filtersActive =
    query || stageFilter !== "all" || cityFilter !== "all" || phaseFilter !== "all";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CUSTOMER_PHASES.map((phase) => {
          const Icon = PHASE_ICONS[phase.id];
          const active = phaseFilter === phase.id;
          return (
            <button
              key={phase.id}
              type="button"
              onClick={() => setPhase(active ? "all" : phase.id)}
              className={cn(
                "rounded-2xl border p-4 text-left shadow-[var(--shadow)] transition",
                active
                  ? "border-[var(--primary)] bg-[var(--primary-faint)]"
                  : "border-[var(--border)] bg-white hover:border-[var(--primary)]/40"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {phase.label}
                </span>
                <Icon className="h-4 w-4 text-[var(--primary)]" />
              </div>
              <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text-dark)]">
                {phaseCounts[phase.id]}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-white p-3 shadow-[var(--shadow)]">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            type="search"
            placeholder="Search name, phone, city, portal…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <ViewAsPicker users={povUsers} />
        <Select
          value={stageFilter}
          onChange={(event) => setStageFilter(event.target.value as SalesStage | "all")}
          className="w-auto"
        >
          <option value="all">All stages</option>
          {stageOptions.map((stage) => (
            <option key={stage} value={stage}>
              {SALES_STAGE_LABELS[stage]}
            </option>
          ))}
        </Select>
        <Select
          value={cityFilter}
          onChange={(event) => setCityFilter(event.target.value)}
          className="w-auto"
        >
          <option value="all">All cities</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </Select>
        <Select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          className="w-auto"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              Sort: {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">
          {filtered.length} customer{filtered.length === 1 ? "" : "s"}
          {phaseFilter !== "all"
            ? ` in ${CUSTOMER_PHASES.find((phase) => phase.id === phaseFilter)?.label}`
            : ""}
        </p>
      </div>

      <div
        ref={prefetchRootRef}
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      >
        {filtered.map((customer) => {
          const install = isInstallationCustomerStage(customer.sales_stage);
          return (
            <button
              key={customer.id}
              type="button"
              data-lead-id={customer.id}
              onMouseEnter={() => prefetchLead(customer.id)}
              onFocus={() => prefetchLead(customer.id)}
              onPointerDown={() => prefetchLead(customer.id)}
              onClick={() => openCustomerRecord(customer)}
              className="rounded-2xl border border-[var(--border)] bg-white p-4 text-left shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--primary)]/35 hover:shadow-[var(--shadow-lg)]"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    install
                      ? "bg-[var(--info-light)] text-[var(--info)]"
                      : "bg-[var(--primary-light)] text-[var(--primary)]"
                  )}
                >
                  {initials(customer.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold text-[var(--text-dark)]">
                      {customer.name}
                    </p>
                    <Badge variant={customer.sales_stage}>
                      {SALES_STAGE_LABELS[customer.sales_stage]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {formatPhone(customer.phone)}
                    {customer.city ? ` · ${customer.city}` : ""}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                {customer.portal_code && (
                  <span className="font-mono font-semibold text-[var(--primary)]">
                    Portal {customer.portal_code}
                  </span>
                )}
                <span>{assignedLabel(customer)}</span>
                <span>{formatDateTime(customer.created_at)}</span>
              </div>
              {customer.requirement_notes && (
                <p className="mt-2 line-clamp-2 text-xs text-[var(--text-body)]">
                  {customer.requirement_notes}
                </p>
              )}
              <p
                className={cn(
                  "mt-3 text-xs font-semibold",
                  install ? "text-[var(--info)]" : "text-[var(--primary)]"
                )}
              >
                {install ? "Open installation →" : "Open customer →"}
              </p>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-[var(--text-muted)]">
          {filtersActive ? "No customers match your filters" : "No customers yet"}
        </p>
      )}
    </div>
  );
}
