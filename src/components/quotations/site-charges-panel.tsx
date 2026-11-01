"use client";

import type { UseFormSetValue, UseFormWatch } from "react-hook-form";
import type { QuotationPayload } from "@/lib/quotations/validations";
import { Input } from "@/components/ui/input";
import {
  FLOOR_RATE_DEFAULTS,
  calcFloorLine,
} from "@/lib/quotations/site-charges";
import { inr } from "@/lib/quotations/format";
import { cn } from "@/lib/utils";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "min-h-9 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
        active
          ? "border-brand-300 bg-brand-50 text-brand-800 ring-1 ring-brand-200"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      {children}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-7 w-12 shrink-0 rounded-full transition-colors",
          checked ? "bg-accent-500" : "bg-slate-200"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform",
            checked ? "left-[22px]" : "left-0.5"
          )}
        />
      </button>
    </label>
  );
}

export function SiteChargesPanel({
  watch,
  setValue,
}: {
  watch: UseFormWatch<QuotationPayload>;
  setValue: UseFormSetValue<QuotationPayload>;
}) {
  const siteCharges = watch("siteCharges");
  const floors = siteCharges?.floors;

  const floorLine = floors ? calcFloorLine(floors) : null;

  return (
    <div className="space-y-4">
      <Toggle
        checked={Boolean(floors?.enabled)}
        onChange={(v) => setValue("siteCharges.floors.enabled", v)}
        label="Floor surcharge"
        description="Extra charge for multi-storey residential or commercial sites"
      />

      {floors?.enabled && (
        <div className="space-y-4 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-800/80">Building type</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(["residential", "commercial"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setValue("siteCharges.floors.buildingType", type);
                    setValue("siteCharges.floors.ratePerFloor", FLOOR_RATE_DEFAULTS[type]);
                  }}
                  className={cn(
                    "min-h-11 rounded-xl border px-3 py-2 text-sm font-medium capitalize transition",
                    floors.buildingType === type
                      ? "border-violet-300 bg-white text-violet-900 ring-1 ring-violet-200"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  )}
                >
                  {type}
                  <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                    ₹{FLOOR_RATE_DEFAULTS[type]}/floor default
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Number of floors</label>
              <Input
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
                value={floors.floorCount}
                onChange={(e) => setValue("siteCharges.floors.floorCount", Math.max(1, Number(e.target.value) || 1))}
                className="min-h-11"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Rate per floor (₹)</label>
              <Input
                type="number"
                min={0}
                inputMode="decimal"
                value={floors.ratePerFloor}
                onChange={(e) => setValue("siteCharges.floors.ratePerFloor", Number(e.target.value) || 0)}
                className="min-h-11"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">GST %</label>
              <Input
                type="number"
                min={0}
                max={100}
                value={floors.gstPercent}
                onChange={(e) => setValue("siteCharges.floors.gstPercent", Number(e.target.value) || 0)}
                className="min-h-11"
              />
            </div>
          </div>

          {floorLine && (
            <div className="rounded-lg border border-violet-200 bg-white px-4 py-3 text-sm">
              <p className="text-slate-500">{floorLine.label}</p>
              <p className="mt-1 text-lg font-semibold text-violet-900">{inr(floorLine.total)}</p>
            </div>
          )}
        </div>
      )}

      {floorLine && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p className="font-medium text-slate-700">Site surcharges summary</p>
          <ul className="mt-2 space-y-1 text-slate-600">
            <li>{floorLine.label} — {inr(floorLine.total)}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
