"use client";

import { useEffect, useState, useTransition } from "react";
import { Columns3, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import {
  importLeadsFromExcel,
  getUndistributedLeads,
  getSalesEmployees,
  distributeLeads,
  getImportBatches,
  previewImportHeaders,
  getLeadImportProfile,
  saveLeadImportProfile,
} from "@/actions/lead-import";
import {
  IMPORT_FIELD_LABELS,
  type ImportRowError,
  type LeadImportColumnMapping,
} from "@/lib/leads/lead-import-mapping";
import { formatDateTime } from "@/lib/utils";

type Undistributed = {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  created_at: string;
};

type Batch = {
  id: string;
  file_name: string;
  total_rows: number;
  success_rows: number;
  error_rows: number;
  created_at: string;
  importer?: { name: string } | null;
};

const FIELD_KEYS = Object.keys(IMPORT_FIELD_LABELS) as (keyof LeadImportColumnMapping)[];

export function LeadImportWorkspace({
  canImport,
  canDistribute,
}: {
  canImport: boolean;
  canDistribute: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    successRows: number;
    errorRows: number;
    errors: ImportRowError[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undistributed, setUndistributed] = useState<Undistributed[]>([]);
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigneeId, setAssigneeId] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);

  const [sampleHeaders, setSampleHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<LeadImportColumnMapping>({});
  const [mapMessage, setMapMessage] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [profileSavedAt, setProfileSavedAt] = useState<string | null>(null);

  async function reload() {
    if (canDistribute) {
      const [leads, staff] = await Promise.all([
        getUndistributedLeads(),
        getSalesEmployees(),
      ]);
      setUndistributed(leads as Undistributed[]);
      setEmployees(staff.map((s) => ({ id: s.id, name: s.name })));
    }
    if (canImport) {
      const [b, profile] = await Promise.all([
        getImportBatches(),
        getLeadImportProfile().catch(() => null),
      ]);
      setBatches(b as Batch[]);
      if (profile) {
        setMapping(profile.mapping);
        if (profile.sampleHeaders.length) setSampleHeaders(profile.sampleHeaders);
        setProfileSavedAt(profile.updatedAt);
      }
    }
  }

  useEffect(() => {
    void reload().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === undistributed.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(undistributed.map((l) => l.id)));
    }
  }

  return (
    <div className="space-y-8">
      {canImport && (
        <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary-light)]">
              <Columns3 className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-dark)]">
                Column mapping
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Upload a sample spreadsheet, map columns to Name / Phone / etc., then save. Imports
                use this profile for your company.
              </p>
              {profileSavedAt && (
                <p className="mt-1 text-xs text-[var(--success)]">
                  Saved profile · {formatDateTime(profileSavedAt)}
                </p>
              )}
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <Label>Sample file (headers only needed)</Label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="mt-1 block w-full text-sm text-[var(--text-body)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary-light)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--primary)]"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setMapError(null);
                  setMapMessage(null);
                  startTransition(async () => {
                    try {
                      const fd = new FormData();
                      fd.set("file", file);
                      const preview = await previewImportHeaders(fd);
                      setSampleHeaders(preview.headers);
                      setMapMessage(
                        `Loaded ${preview.headers.length} columns from ${preview.fileName} (${preview.sampleRowCount} data row${preview.sampleRowCount === 1 ? "" : "s"})`
                      );
                    } catch (err) {
                      setMapError(err instanceof Error ? err.message : "Could not read headers");
                    }
                  });
                }}
              />
            </div>

            {sampleHeaders.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {FIELD_KEYS.map((field) => (
                  <div key={field}>
                    <Label>
                      {IMPORT_FIELD_LABELS[field]}
                      {field === "name" || field === "phone" ? " *" : ""}
                    </Label>
                    <Select
                      value={mapping[field] ?? ""}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field]: e.target.value || undefined,
                        }))
                      }
                    >
                      <option value="">
                        {field === "name" || field === "phone"
                          ? "Select column…"
                          : "Optional — skip"}
                      </option>
                      {sampleHeaders.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            )}

            {mapError && <p className="text-sm text-[var(--error)]">{mapError}</p>}
            {mapMessage && <p className="text-sm text-[var(--text-body)]">{mapMessage}</p>}

            <Button
              type="button"
              variant="secondary"
              disabled={pending || !mapping.name || !mapping.phone}
              onClick={() =>
                startTransition(async () => {
                  setMapError(null);
                  setMapMessage(null);
                  try {
                    const res = await saveLeadImportProfile({
                      mapping,
                      sampleHeaders,
                    });
                    setMapping(res.mapping);
                    setProfileSavedAt(new Date().toISOString());
                    setMapMessage("Column mapping saved for this company.");
                  } catch (err) {
                    setMapError(err instanceof Error ? err.message : "Save failed");
                  }
                })
              }
            >
              {pending ? "Saving…" : "Save column map"}
            </Button>
          </div>
        </section>
      )}

      {canImport && (
        <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--primary-light)]">
              <Upload className="h-5 w-5 text-[var(--primary)]" />
            </div>
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-dark)]">
                Import from Excel
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {mapping.name && mapping.phone
                  ? "Uses your saved column map. Falls back to Name/Phone aliases if a field is unmapped."
                  : "No saved map yet — Name, Phone (and optional Address) aliases are used. Save a map above for custom headers."}
              </p>
            </div>
          </div>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setError(null);
              setResult(null);
              startTransition(async () => {
                try {
                  const res = await importLeadsFromExcel(fd);
                  setResult({
                    successRows: res.successRows,
                    errorRows: res.errorRows,
                    errors: res.errors,
                  });
                  (e.target as HTMLFormElement).reset();
                  await reload();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Import failed");
                }
              });
            }}
          >
            <div>
              <Label>Excel file (.xlsx)</Label>
              <input
                name="file"
                type="file"
                accept=".xlsx,.xls,.csv"
                required
                className="mt-1 block w-full text-sm text-[var(--text-body)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary-light)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--primary)]"
              />
            </div>
            {error && <p className="text-sm text-[var(--error)]">{error}</p>}
            {result && (
              <div className="rounded-lg bg-[var(--primary-faint)] px-3 py-2 text-sm text-[var(--text-body)]">
                Imported {result.successRows} lead
                {result.successRows === 1 ? "" : "s"}
                {result.errorRows > 0 ? `, ${result.errorRows} row error(s)` : ""}.
                {result.errors.slice(0, 5).map((err) => (
                  <p key={err.rowNumber} className="mt-1 text-xs text-[var(--error)]">
                    Row {err.rowNumber}: {err.message}
                  </p>
                ))}
              </div>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? "Importing…" : "Upload & import"}
            </Button>
          </form>

          {batches.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Recent batches
              </h3>
              <ul className="mt-2 divide-y divide-[var(--border-light)]">
                {batches.map((b) => (
                  <li key={b.id} className="flex justify-between gap-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-[var(--text-dark)]">{b.file_name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {formatDateTime(b.created_at)}
                        {b.importer?.name ? ` · ${b.importer.name}` : ""}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs text-[var(--text-muted)]">
                      {b.success_rows}/{b.total_rows} ok
                      {b.error_rows > 0 ? ` · ${b.error_rows} err` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {canDistribute && (
        <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-[var(--shadow)]">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-light)]">
              <Users className="h-5 w-5 text-[var(--accent-hover)]" />
            </div>
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-dark)]">
                Distribute leads
              </h2>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Assign unassigned imported leads to tele-callers.
              </p>
            </div>
          </div>

          {undistributed.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--text-muted)]">No undistributed leads.</p>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[12rem] flex-1">
                  <Label>Assign to</Label>
                  <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                    <option value="">Select employee</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button
                  type="button"
                  disabled={pending || !assigneeId || selected.size === 0}
                  onClick={() =>
                    startTransition(async () => {
                      setError(null);
                      try {
                        await distributeLeads([...selected], assigneeId);
                        setSelected(new Set());
                        await reload();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Distribute failed");
                      }
                    })
                  }
                >
                  Assign {selected.size || ""} selected
                </Button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[var(--bg)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    <tr>
                      <th className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={
                            undistributed.length > 0 && selected.size === undistributed.length
                          }
                          onChange={toggleAll}
                        />
                      </th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Phone</th>
                      <th className="px-3 py-2">City</th>
                      <th className="px-3 py-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {undistributed.map((lead) => (
                      <tr key={lead.id} className="border-t border-[var(--border-light)]">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={selected.has(lead.id)}
                            onChange={() => toggle(lead.id)}
                          />
                        </td>
                        <td className="px-3 py-2 font-medium text-[var(--text-dark)]">
                          {lead.name}
                        </td>
                        <td className="px-3 py-2">{lead.phone}</td>
                        <td className="px-3 py-2">{lead.city ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                          {formatDateTime(lead.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
