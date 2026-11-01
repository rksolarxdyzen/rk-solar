"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { loadCatalogPageData } from "@/actions/catalog-page";
import { CatalogAdmin } from "@/components/catalog/catalog-admin";
import { InverterRateCardManager } from "@/components/catalog/inverter-rate-card-manager";
import { RateCardManager } from "@/components/catalog/rate-card-manager";
import { CatalogTabs } from "@/components/catalog/catalog-tabs";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";

function CatalogInner() {
  const { companyId } = useLocalFirstSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const activeTab =
    tab === "rate-card"
      ? "rate-card"
      : tab === "inverters"
        ? "inverters"
        : "items";

  const { data, isPending } = useQuery({
    queryKey: ["rk", "catalog", companyId] as const,
    queryFn: () => loadCatalogPageData(),
  });

  useEffect(() => {
    if (data && !data.canManageCatalog) router.replace("/");
  }, [data, router]);

  if (isPending && !data) {
    return <div className="min-h-[40vh]" aria-busy="true" />;
  }
  if (!data?.canManageCatalog || !data.catalog) return null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Catalogue</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Item master, per-kW panel rate card, and inverter catalog for solar BOM
        </p>
      </div>

      <CatalogTabs active={activeTab} />

      {activeTab === "rate-card" ? (
        <RateCardManager panels={data.ratePanels} canEdit={data.canManageCatalog} />
      ) : activeTab === "inverters" ? (
        <InverterRateCardManager
          inverters={data.rateInverters}
          canEdit={data.canManageCatalog}
        />
      ) : (
        <CatalogAdmin
          items={data.catalog.items}
          brands={data.catalog.brands}
          categories={data.catalog.categories}
          canManage={data.canManageCatalog}
        />
      )}
    </div>
  );
}

export default function CatalogPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}>
      <CatalogInner />
    </Suspense>
  );
}
