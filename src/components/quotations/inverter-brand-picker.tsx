"use client";

import { Input } from "@/components/ui/input";
import { INVERTER_BRANDS, type InverterBrand } from "@/lib/quotations/inverter-brand";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-sm font-medium text-slate-700">{children}</label>;
}

export function InverterBrandPicker({
  brand,
  size,
  onBrandChange,
  onSizeChange,
}: {
  brand: InverterBrand | "";
  size: string;
  onBrandChange: (brand: InverterBrand) => void;
  onSizeChange: (size: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel>Inverter make</FieldLabel>
        <div className="grid max-w-lg grid-cols-2 gap-2 sm:grid-cols-3">
          {INVERTER_BRANDS.map((option) => {
            const active = brand === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onBrandChange(option)}
                className={`min-h-11 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                  active
                    ? "border-brand-300 bg-brand-50 text-brand-900 ring-1 ring-brand-200"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
        {!brand && (
          <p className="mt-1.5 text-xs text-red-600">Select an inverter make.</p>
        )}
      </div>

      <div className="max-w-md">
        <FieldLabel>Inverter size (shown on quote)</FieldLabel>
        <Input
          type="text"
          value={size}
          onChange={(e) => onSizeChange(e.target.value)}
          placeholder="e.g. 5 kW, 8 kW three phase"
          className="min-h-11"
          autoComplete="off"
        />
        <p className="mt-1.5 text-xs text-slate-500">Free text — appears on the proposal system page.</p>
      </div>
    </div>
  );
}
