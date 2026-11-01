"use client";

import type { RateCardPanel } from "@/lib/quotations/rate-card-panels";
import { panelCapacityLabel } from "@/lib/quotations/rate-card-panels";
import { parseInverterSizeKw } from "@/lib/quotations/rate-card-inverters";
import type { InverterBrand } from "@/lib/quotations/inverter-brand";
import type { QuoteTier } from "@/components/quotations/quote-tier-toggle";
import { getPerKwRate } from "@/lib/quotations/per-kw-pricing";
import { PanelSearchPicker } from "@/components/quotations/panel-search-picker";
import { InverterBrandPicker } from "@/components/quotations/inverter-brand-picker";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/quotations/format";
import { SUBSIDY_SCHEME_LABELS, type SubsidyScheme } from "@/lib/quotations/subsidy";
import type { ProjectType } from "@/lib/quotations/project-type";
import {
  PANEL_MOUNT_TYPES,
  PANEL_MOUNT_TYPE_LABELS,
  type PanelMountType,
} from "@/lib/quotations/commercial";
import { cn } from "@/lib/utils";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-sm font-medium text-slate-700">{children}</label>;
}

export function SystemDetailsPanel({
  panels,
  projectType,
  quoteTier = "premium",
  subsidyScheme = "residential",
  subsidyTotal = 0,
  subsidyLabel = "Subsidy (auto)",
  panelId,
  systemCost,
  systemSizeKw,
  panelCount,
  ratePerKw = 0,
  inverterBrand,
  inverterSize,
  panelMountType = null,
  onPanelChange,
  onPanelCountChange,
  onInverterBrandChange,
  onInverterSizeChange,
  onPanelMountTypeChange,
  showPricing = true,
}: {
  panels: RateCardPanel[];
  projectType: ProjectType;
  quoteTier?: QuoteTier;
  subsidyScheme?: SubsidyScheme;
  subsidyTotal?: number;
  subsidyLabel?: string;
  panelId: string;
  systemCost: number;
  systemSizeKw: number;
  panelCount: number;
  ratePerKw?: number;
  inverterBrand: InverterBrand | "";
  inverterSize: string;
  panelMountType?: PanelMountType | null;
  onPanelChange: (id: string) => void;
  onPanelCountChange?: (count: number) => void;
  onInverterBrandChange: (brand: InverterBrand) => void;
  onInverterSizeChange: (size: string) => void;
  onPanelMountTypeChange?: (mount: PanelMountType) => void;
  showPricing?: boolean;
}) {
  const isCommercial = projectType === "commercial";
  const inverterKw = inverterSize ? parseInverterSizeKw(inverterSize) : 0;

  const selectedPanel = panels.find((p) => p.id === panelId) ?? null;
  const activeRatePerKw =
    ratePerKw > 0
      ? ratePerKw
      : selectedPanel
        ? getPerKwRate(selectedPanel, projectType, quoteTier) ?? 0
        : 0;

  const tierLabel = quoteTier === "premium" ? "Premium" : "Regular";
  const projectLabel = isCommercial ? "Commercial" : "Residential";
  const capacityLabel = panelCapacityLabel(selectedPanel);
  const showSystemSummary = Boolean(panelId && panelCount > 0);

  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>Panel</FieldLabel>
        <PanelSearchPicker panels={panels} value={panelId} onChange={onPanelChange} />
      </div>

      {selectedPanel && (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-100 bg-brand-50/40 px-4 py-3 text-sm">
            <p className="font-semibold text-brand-900">
              {tierLabel} · {projectLabel} turnkey rate
            </p>
            <p className="mt-0.5 text-brand-800/80">
              {activeRatePerKw > 0
                ? `${inr(activeRatePerKw)} / kW (GST incl.)`
                : "Configure rates in Catalog → Rate card"}
            </p>
          </div>
          <div>
            <FieldLabel>Number of panels</FieldLabel>
            <Input
              type="number"
              min={1}
              step={1}
              value={panelCount || ""}
              onChange={(e) => onPanelCountChange?.(Math.max(0, Number(e.target.value) || 0))}
              className="min-h-11 max-w-xs"
              placeholder="e.g. 6"
            />
            {systemSizeKw > 0 && (
              <p className="mt-1.5 text-xs text-slate-500">
                System capacity: {systemSizeKw} kW
                {capacityLabel && panelCount > 0
                  ? ` · ${panelCount} × ${capacityLabel} panels`
                  : ""}
              </p>
            )}
          </div>
        </div>
      )}

      {showSystemSummary && (
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-slate-500">Panels</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">{panelCount || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">DC size</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {systemSizeKw ? `${systemSizeKw} kW` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">{subsidyLabel}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {subsidyTotal > 0 ? inr(subsidyTotal) : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {SUBSIDY_SCHEME_LABELS[subsidyScheme]}
              {isCommercial ? " · commercial" : ""}
            </p>
          </div>
        </div>
      )}

      {showPricing && systemSizeKw > 0 && activeRatePerKw > 0 && (
        <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>
              {inr(activeRatePerKw)}/kW × {systemSizeKw} kW
            </span>
            <span className="font-medium tabular-nums text-slate-900">{inr(systemCost)}</span>
          </div>
          <p className="text-xs text-slate-500">
            Turnkey system price (GST inclusive) · locked for sales
          </p>
        </div>
      )}

      {isCommercial && (
        <div>
          <FieldLabel>Panel mount option</FieldLabel>
          <div className="grid gap-2">
            {PANEL_MOUNT_TYPES.map((mount) => {
              const active = panelMountType === mount;
              return (
                <button
                  key={mount}
                  type="button"
                  onClick={() => onPanelMountTypeChange?.(mount)}
                  className={cn(
                    "min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition",
                    active
                      ? "border-brand-300 bg-brand-50 text-brand-900 ring-1 ring-brand-200"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  {PANEL_MOUNT_TYPE_LABELS[mount]}
                </button>
              );
            })}
          </div>
          {!panelMountType && (
            <p className="mt-1.5 text-xs text-red-600">Select a panel mount option.</p>
          )}
        </div>
      )}

      <InverterBrandPicker
        brand={inverterBrand}
        size={inverterSize}
        onBrandChange={onInverterBrandChange}
        onSizeChange={onInverterSizeChange}
      />
      {inverterBrand && inverterSize.trim() && inverterKw > 0 && (
        <p className="text-xs text-slate-500">Parsed capacity: ≈ {inverterKw} kW</p>
      )}
    </div>
  );
}
