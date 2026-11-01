"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  approveFeasibilityReport,
  rejectFeasibilityReport,
} from "@/actions/feasibility";
import { formatDateTime } from "@/lib/utils";

type QueueRow = {
  id: string;
  title: string;
  status: string;
  notes: string | null;
  file_url: string | null;
  created_at: string;
  lead?: {
    id: string;
    name: string;
    phone: string;
    city: string | null;
  } | null;
};

export function FeasibilityQueueClient({
  initialRows,
  canApprove,
}: {
  initialRows: QueueRow[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<Record<string, string>>({});

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Report</th>
              <th className="px-3 py-2">Submitted</th>
              {canApprove && <th className="px-3 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--border-light)] align-top">
                <td className="px-3 py-2">
                  <p className="font-medium">{row.lead?.name ?? "—"}</p>
                  <p className="text-xs text-[var(--text-muted)]">{row.lead?.phone}</p>
                </td>
                <td className="px-3 py-2">
                  <p className="font-medium">{row.title}</p>
                  {row.notes && <p className="text-xs text-[var(--text-muted)]">{row.notes}</p>}
                  {row.file_url && (
                    <a
                      href={row.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-[var(--primary)]"
                    >
                      Open file
                    </a>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                  {formatDateTime(row.created_at)}
                </td>
                {canApprove && (
                  <td className="px-3 py-2">
                    <div className="flex min-w-[180px] flex-col gap-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              setError(null);
                              try {
                                await approveFeasibilityReport(row.id);
                                setRows((prev) => prev.filter((r) => r.id !== row.id));
                                router.refresh();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Failed");
                              }
                            })
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              setError(null);
                              try {
                                await rejectFeasibilityReport(
                                  row.id,
                                  reason[row.id] || "Needs revision"
                                );
                                setRows((prev) => prev.filter((r) => r.id !== row.id));
                                router.refresh();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Failed");
                              }
                            })
                          }
                        >
                          Reject
                        </Button>
                      </div>
                      <Input
                        placeholder="Reject reason"
                        value={reason[row.id] ?? ""}
                        onChange={(e) =>
                          setReason((s) => ({ ...s, [row.id]: e.target.value }))
                        }
                      />
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={canApprove ? 4 : 3}
                  className="px-3 py-10 text-center text-[var(--text-muted)]"
                >
                  No pending feasibility reports.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
