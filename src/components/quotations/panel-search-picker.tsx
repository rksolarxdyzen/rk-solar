"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterPanelsByQuery,
  panelCapacityLabel,
  type RateCardPanel,
} from "@/lib/quotations/rate-card-panels";
import { cn } from "@/lib/utils";

export function PanelSearchPicker({
  panels,
  value,
  onChange,
  disabled = false,
  placeholder = "Type to search panels…",
}: {
  panels: RateCardPanel[];
  value: string;
  onChange: (panelId: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const selected = useMemo(
    () => panels.find((p) => p.id === value) ?? null,
    [panels, value]
  );

  const activePanels = useMemo(
    () => panels.filter((p) => p.is_active),
    [panels]
  );

  const filtered = useMemo(
    () => filterPanelsByQuery(activePanels, query),
    [activePanels, query]
  );

  useEffect(() => {
    if (selected) {
      setQuery(selected.panel_name);
    }
  }, [selected?.id, selected?.panel_name]);

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
            <li className="px-3 py-2 text-sm text-slate-500">No matching panels</li>
          ) : (
            filtered.map((panel) => (
              <li key={panel.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-slate-50",
                    panel.id === value && "bg-brand-50 text-brand-900"
                  )}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(panel.id);
                    setQuery(panel.panel_name);
                    setOpen(false);
                  }}
                >
                  <span className="font-medium">{panel.panel_name}</span>
                  {panelCapacityLabel(panel) ? (
                    <span className="text-xs text-slate-500">{panelCapacityLabel(panel)}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {activePanels.length === 0 && (
        <p className="mt-1.5 text-xs text-amber-700">
          No rate card panels. Configure Catalog → Rate card first.
        </p>
      )}
    </div>
  );
}
