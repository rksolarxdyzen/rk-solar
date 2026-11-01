"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SerialScanInput, type ScanEntry } from "@/components/inventory/serial-scan-input";

type SiteSerial = { serial_no: string; item_id: string; item_name: string };

function entryKey(serial: string) {
  return `pick-${serial}`;
}

function selectedSerials(entries: ScanEntry[]): Set<string> {
  return new Set(entries.filter((e) => e.status === "ok" && e.serial).map((e) => e.serial as string));
}

export function ReturnSerialPicker({
  itemId,
  siteSerials,
  takenByOtherLines,
  scanMode,
  serialPattern,
  leadId,
  partyId,
  entries,
  onChange,
  siteWord,
}: {
  itemId: string;
  siteSerials: SiteSerial[];
  /** Serials already selected on other return lines for the same item. */
  takenByOtherLines: Set<string>;
  scanMode: "whole" | "extract";
  serialPattern: string | null;
  leadId: string | null;
  partyId: string | null;
  entries: ScanEntry[];
  onChange: (entries: ScanEntry[]) => void;
  siteWord: string;
}) {
  const [showScan, setShowScan] = useState(false);
  const available = useMemo(
    () => siteSerials.filter((s) => s.item_id === itemId).map((s) => s.serial_no),
    [siteSerials, itemId]
  );
  const selected = selectedSerials(entries);

  function toggle(serial: string) {
    if (takenByOtherLines.has(serial)) return;
    if (selected.has(serial)) {
      onChange(entries.filter((e) => e.serial !== serial));
      return;
    }
    onChange([
      ...entries.filter((e) => e.serial !== serial),
      {
        key: entryKey(serial),
        raw: serial,
        serial,
        status: "ok",
        message: null,
        segments: [],
      },
    ]);
  }

  function onScanChange(next: ScanEntry[]) {
    // Only keep OK serials that are actually at this site for this item.
    const allowed = new Set(available);
    const cleaned = next.map((e) => {
      if (e.status !== "ok" || !e.serial) return e;
      if (!allowed.has(e.serial)) {
        return {
          ...e,
          status: "error" as const,
          message: `Not among serials sent to this ${siteWord}`,
        };
      }
      if (takenByOtherLines.has(e.serial)) {
        return {
          ...e,
          status: "error" as const,
          message: "Already selected on another line",
        };
      }
      return e;
    });
    onChange(cleaned);
  }

  if (available.length === 0) {
    return (
      <p className="text-sm text-[var(--warn)]">
        No serial numbers for this item are at this {siteWord}. Dispatch them first, or pick another
        item.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-[var(--text-muted)]">
        Select serials that were sent to this {siteWord}. {selected.size} of {available.length}{" "}
        selected.
      </p>
      <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-[var(--border)] p-1.5">
        {available.map((serial) => {
          const taken = takenByOtherLines.has(serial);
          const on = selected.has(serial);
          return (
            <li key={serial}>
              <button
                type="button"
                disabled={taken}
                onClick={() => toggle(serial)}
                className={cn(
                  "flex w-full min-h-11 items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-mono transition",
                  taken && "cursor-not-allowed opacity-40",
                  on
                    ? "bg-[var(--primary)] text-white"
                    : "bg-white text-[var(--text-dark)] hover:bg-[var(--bg)]"
                )}
                aria-pressed={on}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                    on ? "border-white bg-white/20" : "border-[var(--border)]"
                  )}
                >
                  {on ? <Check className="h-3.5 w-3.5" /> : null}
                </span>
                <span className="min-w-0 truncate">{serial}</span>
                {taken ? <span className="ml-auto text-[10px] font-sans opacity-80">Other line</span> : null}
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className="text-xs font-semibold text-[var(--primary)] hover:underline"
        onClick={() => setShowScan((v) => !v)}
      >
        {showScan ? "Hide scan" : "Scan to match a sent serial"}
      </button>

      {showScan ? (
        <SerialScanInput
          itemId={itemId}
          scanMode={scanMode}
          serialPattern={serialPattern}
          checkMode="return"
          leadId={leadId}
          partyId={partyId}
          entries={entries}
          onChange={onScanChange}
        />
      ) : null}
    </div>
  );
}
