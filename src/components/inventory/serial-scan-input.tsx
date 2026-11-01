"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ClipboardPaste, FileSpreadsheet, Loader2, ScanLine, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { checkSerials } from "@/actions/inventory";
import { normalizeSerial, parseScan } from "@/lib/inventory/serial-parse";
import type { SerialCheckMode, SerialScanMode } from "@/lib/inventory/types";

export type ScanStatus = "checking" | "ok" | "error" | "pick";

export interface ScanEntry {
  key: string;
  raw: string;
  serial: string | null;
  status: ScanStatus;
  message?: string | null;
  segments: string[];
}

/** Gap after Enter/Tab before a scan is committed: a multi-line QR keeps typing within this window. */
const LINE_GAP_MS = 80;
/** Scanners type much faster than people; a fast burst with no Enter commits after this idle time. */
const BURST_IDLE_MS = 150;
const FAST_KEY_MS = 35;

let audioCtx: AudioContext | null = null;
function feedback(ok: boolean) {
  try {
    audioCtx ??= new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = ok ? 1200 : 300;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + (ok ? 0.07 : 0.25));
  } catch {
    // Audio is optional.
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(ok ? 30 : [60, 40, 60]);
}

export function entriesToSerials(entries: ScanEntry[]) {
  return entries
    .filter((e) => e.status === "ok" && e.serial)
    .map((e) => (e.raw && e.raw !== e.serial ? { serial_no: e.serial as string, raw_scan: e.raw } : (e.serial as string)));
}

export function SerialScanInput({
  itemId,
  scanMode,
  serialPattern,
  checkMode,
  leadId,
  partyId,
  entries,
  onChange,
  expected,
  autoFocus = true,
}: {
  itemId: string;
  scanMode: SerialScanMode;
  serialPattern?: string | null;
  checkMode: SerialCheckMode;
  leadId?: string | null;
  partyId?: string | null;
  entries: ScanEntry[];
  onChange: (next: ScanEntry[]) => void;
  expected?: number | null;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  const update = useCallback(
    (fn: (prev: ScanEntry[]) => ScanEntry[]) => {
      const next = fn(entriesRef.current);
      entriesRef.current = next;
      onChange(next);
    },
    [onChange]
  );
  const [text, setText] = useState("");
  const linesRef = useRef<string[]>([]);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyTimes = useRef<number[]>([]);
  const pendingCheck = useRef<Set<string>>(new Set());
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const runChecks = useCallback(() => {
    const serials = [...pendingCheck.current];
    pendingCheck.current.clear();
    if (serials.length === 0) return;
    void (async () => {
      for (let i = 0; i < serials.length; i += 500) {
        const chunk = serials.slice(i, i + 500);
        const res = await checkSerials({
          item_id: itemId,
          serials: chunk,
          mode: checkMode,
          lead_id: leadId ?? undefined,
          party_id: partyId ?? undefined,
        });
        const byInput = new Map(res.ok ? res.results.map((r) => [r.serial_no ?? r.input, r]) : []);
        update((prev) =>
          prev.map((e) => {
            if (e.status !== "checking" || !e.serial || !chunk.includes(e.serial)) return e;
            if (!res.ok) return { ...e, status: "error", message: res.error };
            const r = byInput.get(e.serial);
            return r?.ok ? { ...e, status: "ok", message: null } : { ...e, status: "error", message: r?.message ?? "Could not check" };
          })
        );
        feedback(res.ok && res.results.every((r) => r.ok));
      }
    })();
  }, [itemId, checkMode, leadId, partyId, update]);

  const queueCheck = useCallback(
    (serials: string[]) => {
      serials.forEach((s) => pendingCheck.current.add(s));
      if (checkTimer.current) clearTimeout(checkTimer.current);
      checkTimer.current = setTimeout(runChecks, 250);
    },
    [runChecks]
  );

  const addRaw = useCallback(
    (raws: string[]) => {
      const toCheck: string[] = [];
      update((prev) => {
        const seen = new Set(prev.map((e) => e.serial).filter(Boolean));
        const next = [...prev];
        for (const raw of raws) {
          if (!raw.trim()) continue;
          const parsed = parseScan(raw, scanMode, serialPattern);
          const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
          if (!parsed.serial) {
            next.push({ key, raw: parsed.raw, serial: null, status: "pick", message: "Pick the serial number", segments: parsed.segments });
            continue;
          }
          if (seen.has(parsed.serial)) {
            next.push({ key, raw: parsed.raw, serial: parsed.serial, status: "error", message: "Already scanned in this list", segments: [] });
            continue;
          }
          seen.add(parsed.serial);
          toCheck.push(parsed.serial);
          next.push({ key, raw: parsed.raw, serial: parsed.serial, status: "checking", segments: [] });
        }
        return next;
      });
      if (toCheck.length) queueCheck(toCheck);
      else feedback(false);
    },
    [update, scanMode, serialPattern, queueCheck]
  );

  const commit = useCallback(() => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    const current = inputRef.current?.value ?? "";
    const raw = [...linesRef.current, current].filter((l) => l.length > 0).join("\n");
    linesRef.current = [];
    keyTimes.current = [];
    setText("");
    if (raw.trim()) addRaw([raw]);
  }, [addRaw]);

  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
      if (checkTimer.current) clearTimeout(checkTimer.current);
    },
    []
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      linesRef.current.push(e.currentTarget.value);
      setText("");
      if (commitTimer.current) clearTimeout(commitTimer.current);
      commitTimer.current = setTimeout(commit, LINE_GAP_MS);
      return;
    }
    if (e.key.length === 1) {
      const now = performance.now();
      keyTimes.current.push(now);
      if (keyTimes.current.length > 12) keyTimes.current.shift();
    }
  }

  function onInputChange(value: string) {
    setText(value);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    const times = keyTimes.current;
    const fast =
      times.length >= 6 &&
      times.slice(1).every((t, i) => t - times[i] < FAST_KEY_MS);
    if (fast || linesRef.current.length > 0) {
      commitTimer.current = setTimeout(commit, fast ? BURST_IDLE_MS : LINE_GAP_MS * 3);
    }
  }

  function pickSegment(entry: ScanEntry, value: string) {
    const serial = normalizeSerial(value);
    if (!serial) return;
    const dup = entriesRef.current.some((e) => e.key !== entry.key && e.serial === serial);
    update((prev) =>
      prev.map((e) =>
        e.key === entry.key
          ? dup
            ? { ...e, serial, status: "error", message: "Already scanned in this list" }
            : { ...e, serial, status: "checking", message: null }
          : e
      )
    );
    if (!dup) queueCheck([serial]);
    inputRef.current?.focus();
  }

  function remove(key: string) {
    update((prev) => prev.filter((e) => e.key !== key));
    inputRef.current?.focus();
  }

  async function onExcel(file: File) {
    setFileError(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames.find((n) => /serial/i.test(n)) ?? wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: false });
      if (rows.length === 0) throw new Error("The sheet is empty.");
      const header = (rows[0] ?? []).map((h) => String(h ?? "").toLowerCase().replace(/[^a-z]/g, ""));
      let col = header.findIndex((h) => ["serial", "serialno", "serialnumber", "sn", "slno"].includes(h) || h.startsWith("serial"));
      const start = col >= 0 ? 1 : 0;
      if (col < 0) col = 0;
      const values = rows.slice(start).map((r) => String((r as unknown[])[col] ?? "").trim()).filter(Boolean);
      if (values.length === 0) throw new Error("No serial numbers found in the file.");
      addRaw(values);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Could not read the file.");
    }
  }

  const okCount = entries.filter((e) => e.status === "ok").length;
  const problemCount = entries.filter((e) => e.status === "error" || e.status === "pick").length;
  const checking = entries.some((e) => e.status === "checking");

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border-2 border-dashed px-3 py-2 transition",
          focused ? "border-[var(--primary)] bg-[var(--primary-faint)]/40" : "border-[var(--border)]"
        )}
      >
        <ScanLine className={cn("h-6 w-6 shrink-0", focused ? "text-[var(--primary)]" : "text-[var(--text-muted)]")} />
        <input
          ref={inputRef}
          value={text}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={focused ? "Ready to scan…" : "Click here, then scan serial barcodes"}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          spellCheck={false}
          enterKeyHint="done"
          className="min-h-[48px] min-w-0 flex-1 bg-transparent text-base font-medium tracking-wide text-[var(--text-dark)] outline-none placeholder:font-normal placeholder:text-[var(--text-muted)]"
          aria-label="Scan serial number"
        />
        {text && (
          <Button type="button" size="sm" onClick={commit}>
            Add
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="font-semibold text-[var(--text-body)]">
          <span className={cn(expected && okCount === expected ? "text-[var(--success)]" : undefined)}>
            {okCount}
            {expected ? ` / ${expected}` : ""} scanned
          </span>
          {problemCount > 0 && <span className="ml-2 text-[var(--error)]">{problemCount} need attention</span>}
          {checking && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" />}
        </p>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowPaste(true)}>
            <ClipboardPaste className="h-3.5 w-3.5" /> Paste list
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--text-light)] hover:bg-[var(--bg)]">
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onExcel(f);
                e.target.value = "";
              }}
            />
          </label>
          {entries.length > 0 && (
            <Button type="button" size="sm" variant="ghost" onClick={() => update(() => [])}>
              Clear
            </Button>
          )}
        </div>
      </div>
      {fileError && <p className="text-xs text-[var(--error)]">{fileError}</p>}

      {entries.length > 0 && (
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {[...entries].reverse().map((e) => (
            <li
              key={e.key}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-sm",
                e.status === "ok" && "border-green-200 bg-[var(--success-light)]",
                e.status === "error" && "border-red-200 bg-[var(--error-light)]",
                e.status === "pick" && "border-amber-200 bg-[var(--warn-light)]",
                e.status === "checking" && "border-[var(--border)]"
              )}
            >
              <div className="flex items-center gap-2">
                {e.status === "ok" && <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" />}
                {e.status === "checking" && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--text-muted)]" />}
                {(e.status === "error" || e.status === "pick") && (
                  <AlertTriangle className={cn("h-4 w-4 shrink-0", e.status === "error" ? "text-[var(--error)]" : "text-[var(--warn)]")} />
                )}
                <span className="min-w-0 flex-1 truncate font-mono font-semibold">{e.serial ?? e.raw}</span>
                {e.message && <span className="hidden truncate text-xs text-[var(--text-muted)] sm:inline">{e.message}</span>}
                <button
                  type="button"
                  onClick={() => remove(e.key)}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-white/70"
                  aria-label={`Remove ${e.serial ?? "scan"}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {e.message && <p className="text-xs text-[var(--text-muted)] sm:hidden">{e.message}</p>}
              {e.status === "pick" && <PickSerial entry={e} onPick={(v) => pickSegment(e, v)} />}
            </li>
          ))}
        </ul>
      )}

      <Modal open={showPaste} onClose={() => setShowPaste(false)} title="Paste serial numbers" subtitle="One serial per line">
        <div className="space-y-3">
          <Textarea rows={8} value={pasteText} onChange={(e) => setPasteText(e.target.value)} className="font-mono" />
          <Button
            type="button"
            className="w-full"
            disabled={!pasteText.trim()}
            onClick={() => {
              addRaw(pasteText.split(/\r?\n/));
              setPasteText("");
              setShowPaste(false);
              inputRef.current?.focus();
            }}
          >
            Add {pasteText.split(/\r?\n/).filter((l) => l.trim()).length} serials
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function PickSerial({ entry, onPick }: { entry: ScanEntry; onPick: (value: string) => void }) {
  const [manual, setManual] = useState("");
  return (
    <div className="mt-1.5 space-y-1.5">
      <p className="break-all text-xs text-[var(--text-muted)]">Scanned: {entry.raw}</p>
      {entry.segments.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {entry.segments.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="min-h-[32px] rounded-md border border-[var(--border)] bg-white px-2 font-mono text-xs hover:border-[var(--primary)]"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <Input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Or type the serial"
          className="h-8 py-1 font-mono text-xs"
        />
        <Button type="button" size="sm" variant="secondary" disabled={!manual.trim()} onClick={() => onPick(manual)}>
          Use
        </Button>
      </div>
    </div>
  );
}
