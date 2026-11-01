"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterInvertersByQuery,
  inverterSizeLabel,
  type RateCardInverter,
} from "@/lib/quotations/rate-card-inverters";
import { cn } from "@/lib/utils";

export function InverterSearchPicker({
  inverters,
  value,
  onChange,
  disabled = false,
  placeholder = "Type to search inverters…",
}: {
  inverters: RateCardInverter[];
  value: string;
  onChange: (inverterId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => inverters.find((inv) => inv.id === value) ?? null,
    [inverters, value]
  );

  const activeInverters = useMemo(
    () => inverters.filter((inv) => inv.is_active),
    [inverters]
  );

  const filtered = useMemo(
    () => filterInvertersByQuery(activeInverters, query),
    [activeInverters, query]
  );

  useEffect(() => {
    if (selected) {
      setQuery(selected.inverter_name);
    }
  }, [selected?.id, selected?.inverter_name]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        className={cn(
          "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm shadow-sm outline-none transition",
          "focus:border-brand-400 focus:ring-2 focus:ring-brand-400/20",
          disabled && "cursor-not-allowed bg-slate-50 text-slate-500"
        )}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value.trim()) onChange("");
        }}
      />
      {open && !disabled && (
        <ul
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No matching inverters</li>
          ) : (
            filtered.map((inverter) => (
              <li key={inverter.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-slate-50",
                    inverter.id === value && "bg-brand-50 text-brand-900"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(inverter.id);
                    setQuery(inverter.inverter_name);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{inverter.inverter_name}</span>
                  {inverterSizeLabel(inverter) ? (
                    <span className="text-xs text-slate-500">{inverterSizeLabel(inverter)}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {activeInverters.length === 0 && (
        <p className="mt-1.5 text-xs text-amber-700">
          No inverter catalog entries. Configure Catalog → Inverters first.
        </p>
      )}
    </div>
  );
}
