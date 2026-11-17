"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateAdSubmissionStatus } from "@/actions/ads-inbox";
import type { AdCampaignSubmission, AdSubmissionStatus } from "@/lib/ads/types";

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const STATUS_STYLE: Record<AdSubmissionStatus, string> = {
  new: "bg-sky-50 text-sky-800",
  contacted: "bg-emerald-50 text-emerald-800",
  junk: "bg-slate-100 text-slate-600",
};

export function AdsInboxTable({ rows }: { rows: AdCampaignSubmission[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setStatus(id: string, status: AdSubmissionStatus) {
    startTransition(async () => {
      await updateAdSubmissionStatus(id, status);
      router.refresh();
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
        <p className="font-[family-name:var(--font-display)] text-xl font-semibold text-[#1e3970]">
          No enquiries yet
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Submissions from <code className="text-[#3158a6]">/go</code> will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-[0.7rem] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">City</th>
              <th className="px-4 py-3 font-semibold">Campaign</th>
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-slate-100 align-top">
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {formatWhen(row.created_at)}
                </td>
                <td className="px-4 py-3 font-semibold text-[#1e3970]">
                  {row.name}
                  {row.message ? (
                    <p className="mt-1 max-w-[220px] text-xs font-normal text-slate-500 line-clamp-2">
                      {row.message}
                    </p>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <a href={`tel:${row.phone}`} className="font-medium text-[#3158a6] hover:underline">
                    {row.phone}
                  </a>
                </td>
                <td className="px-4 py-3 text-slate-600">{row.city || "—"}</td>
                <td className="px-4 py-3 text-slate-600">{row.campaign}</td>
                <td className="px-4 py-3 text-slate-600">
                  {row.utm_source || row.utm_medium
                    ? [row.utm_source, row.utm_medium].filter(Boolean).join(" / ")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[row.status]}`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {row.status !== "contacted" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setStatus(row.id, "contacted")}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 disabled:opacity-50"
                      >
                        Contacted
                      </button>
                    ) : null}
                    {row.status !== "junk" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setStatus(row.id, "junk")}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-50"
                      >
                        Junk
                      </button>
                    ) : null}
                    {row.status !== "new" ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setStatus(row.id, "new")}
                        className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800 disabled:opacity-50"
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
