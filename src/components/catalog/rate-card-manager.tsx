"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RateCardPanelTab } from "@/lib/quotations/rate-card-panels";
import type { RateCardPanel } from "@/lib/quotations/rate-card-panels";
import { deleteRatePanel, upsertRatePanel } from "@/lib/quotations/actions/rate-card";
import { cn } from "@/lib/utils";

type RowDraft = {
  panelName: string;
  panelWattPeak: string;
  regularRate: string;
  premiumRate: string;
};

function emptyDraft(): RowDraft {
  return { panelName: "", panelWattPeak: "", regularRate: "", premiumRate: "" };
}

function panelToDraft(panel: RateCardPanel, tab: RateCardPanelTab): RowDraft {
  const regular =
    tab === "residential"
      ? panel.residential_regular_rate_per_kw
      : panel.commercial_regular_rate_per_kw;
  const premium =
    tab === "residential"
      ? panel.residential_premium_rate_per_kw
      : panel.commercial_premium_rate_per_kw;

  return {
    panelName: panel.panel_name,
    panelWattPeak:
      panel.panel_watt_peak?.trim() ||
      (panel.panel_wattage != null ? String(panel.panel_wattage) : ""),
    regularRate: regular != null ? String(regular) : "",
    premiumRate: premium != null ? String(premium) : "",
  };
}

function dbRowFromDraft(
  panel: RateCardPanel,
  draft: RowDraft,
  tab: RateCardPanelTab
): Parameters<typeof upsertRatePanel>[0] {
  const wattPeak = draft.panelWattPeak.trim();
  const regular = Number(draft.regularRate) || null;
  const premium = Number(draft.premiumRate) || null;

  return {
    id: panel.id,
    panelName: draft.panelName.trim(),
    panelWattPeak: wattPeak,
    residentialRegularRatePerKw:
      tab === "residential" ? regular : panel.residential_regular_rate_per_kw,
    residentialPremiumRatePerKw:
      tab === "residential" ? premium : panel.residential_premium_rate_per_kw,
    commercialRegularRatePerKw:
      tab === "commercial" ? regular : panel.commercial_regular_rate_per_kw,
    commercialPremiumRatePerKw:
      tab === "commercial" ? premium : panel.commercial_premium_rate_per_kw,
    sortOrder: panel.sort_order,
    isActive: panel.is_active,
  };
}

export function RateCardManager({
  panels: initialPanels,
  canEdit,
}: {
  panels: RateCardPanel[];
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [panels, setPanels] = useState(initialPanels);
  const [tab, setTab] = useState<RateCardPanelTab>("residential");
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [newRow, setNewRow] = useState<RowDraft>(emptyDraft);
  const [error, setError] = useState("");

  useEffect(() => {
    const sync = window.setTimeout(() => setPanels(initialPanels), 0);
    return () => window.clearTimeout(sync);
  }, [initialPanels]);

  useEffect(() => {
    const next: Record<string, RowDraft> = {};
    for (const panel of panels) {
      next[panel.id] = panelToDraft(panel, tab);
    }
    setDrafts(next);
  }, [panels, tab]);

  const sortedPanels = useMemo(
    () =>
      [...panels].sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.panel_name.localeCompare(b.panel_name, undefined, { sensitivity: "base" })
      ),
    [panels]
  );

  function updateDraft(id: string, patch: Partial<RowDraft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function savePanel(panel: RateCardPanel) {
    if (!canEdit) return;
    const draft = drafts[panel.id];
    if (!draft?.panelName.trim()) {
      setError("Panel name is required");
      return;
    }
    if (!draft.panelWattPeak.trim()) {
      setError("Watt peak is required");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        const updated = await upsertRatePanel(dbRowFromDraft(panel, draft, tab));
        setPanels((prev) =>
          prev.map((p) =>
            p.id !== panel.id
              ? p
              : {
                  ...p,
                  panel_name: updated.panel_name ?? draft.panelName.trim(),
                  panel_watt_peak: updated.panel_watt_peak?.trim() ?? draft.panelWattPeak.trim(),
                  panel_wattage: updated.panel_wattage != null ? Number(updated.panel_wattage) : null,
                  residential_regular_rate_per_kw:
                    updated.residential_regular_rate_per_kw != null
                      ? Number(updated.residential_regular_rate_per_kw)
                      : null,
                  residential_premium_rate_per_kw:
                    updated.residential_premium_rate_per_kw != null
                      ? Number(updated.residential_premium_rate_per_kw)
                      : null,
                  commercial_regular_rate_per_kw:
                    updated.commercial_regular_rate_per_kw != null
                      ? Number(updated.commercial_regular_rate_per_kw)
                      : null,
                  commercial_premium_rate_per_kw:
                    updated.commercial_premium_rate_per_kw != null
                      ? Number(updated.commercial_premium_rate_per_kw)
                      : null,
                }
          )
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save panel");
      }
    });
  }

  function addPanel() {
    if (!canEdit || !newRow.panelName.trim() || !newRow.panelWattPeak.trim()) return;
    setError("");
    startTransition(async () => {
      try {
        const wattPeak = newRow.panelWattPeak.trim();
        const regular = Number(newRow.regularRate) || null;
        const premium = Number(newRow.premiumRate) || null;
        const created = await upsertRatePanel({
          panelName: newRow.panelName.trim(),
          panelWattPeak: wattPeak,
          residentialRegularRatePerKw: tab === "residential" ? regular : null,
          residentialPremiumRatePerKw: tab === "residential" ? premium : null,
          commercialRegularRatePerKw: tab === "commercial" ? regular : null,
          commercialPremiumRatePerKw: tab === "commercial" ? premium : null,
          sortOrder: panels.length,
        });
        setPanels((prev) => [
          ...prev,
          {
            id: created.id,
            panel_name: created.panel_name ?? newRow.panelName.trim(),
            panel_watt_peak: created.panel_watt_peak?.trim() ?? wattPeak,
            panel_wattage: created.panel_wattage != null ? Number(created.panel_wattage) : null,
            residential_regular_rate_per_kw:
              created.residential_regular_rate_per_kw != null
                ? Number(created.residential_regular_rate_per_kw)
                : tab === "residential"
                  ? regular
                  : null,
            residential_premium_rate_per_kw:
              created.residential_premium_rate_per_kw != null
                ? Number(created.residential_premium_rate_per_kw)
                : tab === "residential"
                  ? premium
                  : null,
            commercial_regular_rate_per_kw:
              created.commercial_regular_rate_per_kw != null
                ? Number(created.commercial_regular_rate_per_kw)
                : tab === "commercial"
                  ? regular
                  : null,
            commercial_premium_rate_per_kw:
              created.commercial_premium_rate_per_kw != null
                ? Number(created.commercial_premium_rate_per_kw)
                : tab === "commercial"
                  ? premium
                  : null,
            use_per_kw_pricing: true,
            sort_order: created.sort_order ?? panels.length,
            is_active: created.is_active ?? true,
          },
        ]);
        setNewRow(emptyDraft());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to add panel");
      }
    });
  }

  function removePanel(id: string) {
    if (!canEdit) return;
    setError("");
    const previous = panels;
    setPanels((prev) => prev.filter((p) => p.id !== id));
    startTransition(async () => {
      try {
        await deleteRatePanel(id);
      } catch (e) {
        setPanels(previous);
        setError(e instanceof Error ? e.message : "Failed to delete panel");
      }
    });
  }

  const tabLabel = tab === "residential" ? "Residential" : "Commercial";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-white px-4 py-3">
        <p className="text-sm font-semibold text-[var(--text-dark)]">Per-kW rate card</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          GST-inclusive turnkey ₹/kW by panel. Solar quotes pick a panel name and enter panel count.
        </p>
      </div>

      <div className="flex gap-1 rounded-lg border border-[var(--border)] bg-white p-1">
        {(["residential", "commercial"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => setTab(kind)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium capitalize transition",
              tab === kind
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--text-muted)] hover:bg-[var(--bg)]"
            )}
          >
            {kind === "residential" ? "Residential" : "Commercial"}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-white">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h3 className="text-sm font-bold text-[var(--text-dark)]">{tabLabel} rates</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--bg)] text-left text-[0.65rem] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="px-4 py-2.5">Panel name</th>
                <th className="px-4 py-2.5 w-36">Watt peak</th>
                <th className="px-4 py-2.5 w-36">Regular ₹/kW</th>
                <th className="px-4 py-2.5 w-36">Premium ₹/kW</th>
                {canEdit && <th className="px-4 py-2.5 w-32" />}
              </tr>
            </thead>
            <tbody>
              {sortedPanels.map((panel) => {
                const draft = drafts[panel.id] ?? panelToDraft(panel, tab);
                return (
                  <tr key={panel.id} className="border-b border-[var(--border-light)] align-top">
                    <td className="px-4 py-2.5">
                      {canEdit ? (
                        <Input
                          value={draft.panelName}
                          onChange={(e) => updateDraft(panel.id, { panelName: e.target.value })}
                        />
                      ) : (
                        draft.panelName
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {canEdit ? (
                        <Input
                          value={draft.panelWattPeak}
                          placeholder="e.g. 545W TOPCon"
                          onChange={(e) => updateDraft(panel.id, { panelWattPeak: e.target.value })}
                        />
                      ) : (
                        draft.panelWattPeak || "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {canEdit ? (
                        <Input
                          type="number"
                          min={0}
                          value={draft.regularRate}
                          onChange={(e) => updateDraft(panel.id, { regularRate: e.target.value })}
                        />
                      ) : (
                        draft.regularRate || "—"
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {canEdit ? (
                        <Input
                          type="number"
                          min={0}
                          value={draft.premiumRate}
                          onChange={(e) => updateDraft(panel.id, { premiumRate: e.target.value })}
                        />
                      ) : (
                        draft.premiumRate || "—"
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => savePanel(panel)}
                          >
                            Save
                          </Button>
                          <button
                            type="button"
                            className="text-xs font-semibold text-[var(--error)]"
                            disabled={pending}
                            onClick={() => removePanel(panel.id)}
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
                <tr className="border-b border-[var(--border-light)] bg-[var(--bg)]/40 align-top">
                  <td className="px-4 py-2.5">
                    <Input
                      placeholder="New panel name"
                      value={newRow.panelName}
                      onChange={(e) => setNewRow((r) => ({ ...r, panelName: e.target.value }))}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <Input
                      placeholder="e.g. 545W TOPCon"
                      value={newRow.panelWattPeak}
                      onChange={(e) => setNewRow((r) => ({ ...r, panelWattPeak: e.target.value }))}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <Input
                      type="number"
                      min={0}
                      value={newRow.regularRate}
                      onChange={(e) => setNewRow((r) => ({ ...r, regularRate: e.target.value }))}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <Input
                      type="number"
                      min={0}
                      value={newRow.premiumRate}
                      onChange={(e) => setNewRow((r) => ({ ...r, premiumRate: e.target.value }))}
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <Button type="button" size="sm" disabled={pending} onClick={addPanel}>
                      Add row
                    </Button>
                  </td>
                </tr>
              )}

              {sortedPanels.length === 0 && !canEdit && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)]">
                    No panels configured yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
    </div>
  );
}
