"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RateCardInverter } from "@/lib/quotations/rate-card-inverters";
import {
  deleteRateInverter,
  upsertRateInverter,
} from "@/lib/quotations/actions/rate-card";

type RowDraft = {
  inverterName: string;
  inverterSize: string;
};

function emptyDraft(): RowDraft {
  return { inverterName: "", inverterSize: "" };
}

function inverterToDraft(inverter: RateCardInverter): RowDraft {
  return {
    inverterName: inverter.inverter_name,
    inverterSize: inverter.inverter_size,
  };
}

export function InverterRateCardManager({
  inverters: initialInverters,
  canEdit,
}: {
  inverters: RateCardInverter[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [inverters, setInverters] = useState(initialInverters);
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [newRow, setNewRow] = useState<RowDraft>(emptyDraft);
  const [error, setError] = useState("");

  useEffect(() => {
    const sync = window.setTimeout(() => setInverters(initialInverters), 0);
    return () => window.clearTimeout(sync);
  }, [initialInverters]);

  useEffect(() => {
    const next: Record<string, RowDraft> = {};
    for (const inverter of inverters) {
      next[inverter.id] = inverterToDraft(inverter);
    }
    setDrafts(next);
  }, [inverters]);

  const sortedInverters = useMemo(
    () =>
      [...inverters].sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.inverter_name.localeCompare(b.inverter_name, undefined, { sensitivity: "base" })
      ),
    [inverters]
  );

  function updateDraft(id: string, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function saveInverter(inverter: RateCardInverter) {
    if (!canEdit) return;
    const draft = drafts[inverter.id];
    if (!draft?.inverterName.trim()) {
      setError("Inverter name is required");
      return;
    }
    if (!draft.inverterSize.trim()) {
      setError("Inverter size is required");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const updated = await upsertRateInverter({
          id: inverter.id,
          inverterName: draft.inverterName.trim(),
          inverterSize: draft.inverterSize.trim(),
          sortOrder: inverter.sort_order,
          isActive: inverter.is_active,
        });
        setInverters((prev) =>
          prev.map((inv) =>
            inv.id !== inverter.id
              ? inv
              : {
                  ...inv,
                  inverter_name: updated.inverter_name ?? draft.inverterName.trim(),
                  inverter_size: updated.inverter_size ?? draft.inverterSize.trim(),
                }
          )
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save inverter");
      }
    });
  }

  function addInverter() {
    if (!canEdit || !newRow.inverterName.trim() || !newRow.inverterSize.trim()) return;
    setError("");
    startTransition(async () => {
      try {
        const created = await upsertRateInverter({
          inverterName: newRow.inverterName.trim(),
          inverterSize: newRow.inverterSize.trim(),
          sortOrder: inverters.length,
        });
        setInverters((prev) => [
          ...prev,
          {
            id: created.id,
            inverter_name: created.inverter_name ?? newRow.inverterName.trim(),
            inverter_size: created.inverter_size ?? newRow.inverterSize.trim(),
            sort_order: created.sort_order ?? inverters.length,
            is_active: created.is_active ?? true,
          },
        ]);
        setNewRow(emptyDraft());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add inverter");
      }
    });
  }

  function removeInverter(id: string) {
    if (!canEdit) return;
    setError("");
    const previous = inverters;
    setInverters((prev) => prev.filter((inv) => inv.id !== id));
    startTransition(async () => {
      try {
        await deleteRateInverter(id);
      } catch (e) {
        setInverters(previous);
        setError(e instanceof Error ? e.message : "Failed to delete inverter");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-3">
        <p className="text-sm font-semibold text-[var(--text-dark)]">Inverter catalog</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Brand or model name plus inverter size for solar BOM and the system package PDF page.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-sm font-bold text-[var(--text-dark)]">Inverters</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)] text-left text-[0.65rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-4 py-2.5">Inverter name</th>
                <th className="px-4 py-2.5 w-40">Inverter size</th>
                {canEdit && <th className="px-4 py-2.5 w-32" />}
              </tr>
            </thead>
            <tbody>
              {sortedInverters.map((inverter) => {
                const draft = drafts[inverter.id] ?? inverterToDraft(inverter);
                return (
                  <tr key={inverter.id} className="border-b border-[var(--border-light)] align-top">
                    <td className="px-4 py-2.5">
                      {canEdit ? (
                        <Input
                          value={draft.inverterName}
                          onChange={(e) => updateDraft(inverter.id, { inverterName: e.target.value })}
                        />
                      ) : (
                        draft.inverterName
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {canEdit ? (
                        <Input
                          value={draft.inverterSize}
                          placeholder="e.g. 5 kW 1ph"
                          onChange={(e) => updateDraft(inverter.id, { inverterSize: e.target.value })}
                        />
                      ) : (
                        draft.inverterSize || "—"
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => saveInverter(inverter)}
                          >
                            Save
                          </Button>
                          <button
                            type="button"
                            className="text-xs font-semibold text-[var(--error)]"
                            disabled={pending}
                            onClick={() => removeInverter(inverter.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
              {canEdit && (
                <tr className="border-b border-[var(--border-light)] align-top bg-[var(--bg)]/50">
                  <td className="px-4 py-2.5">
                    <Input
                      value={newRow.inverterName}
                      placeholder="e.g. Growatt"
                      onChange={(e) => setNewRow((prev) => ({ ...prev, inverterName: e.target.value }))}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <Input
                      value={newRow.inverterSize}
                      placeholder="e.g. 5 kW"
                      onChange={(e) => setNewRow((prev) => ({ ...prev, inverterSize: e.target.value }))}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <Button
                      type="button"
                      size="sm"
                      disabled={
                        pending || !newRow.inverterName.trim() || !newRow.inverterSize.trim()
                      }
                      onClick={addInverter}
                    >
                      Add
                    </Button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
