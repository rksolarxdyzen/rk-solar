"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitFeasibilityReport } from "@/actions/feasibility";
import type { PreInstallQueueItem } from "@/actions/feasibility";
import { Button } from "@/components/ui/button";
import { ProofUploadField } from "@/components/ui/proof-upload-button";
import { SALES_STAGE_LABELS, type SalesStage } from "@/lib/domain/workflow";
import { proofsStoragePathFromUrl } from "@/lib/storage-url";
import { friendlyUploadError } from "@/lib/uploads/proof-mime";

export function PreInstallFeasibilityQueue({
  leads,
  canUpload,
}: {
  leads: PreInstallQueueItem[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fileByLead, setFileByLead] = useState<
    Record<string, { url: string; path: string | null }>
  >({});
  const [doneIds, setDoneIds] = useState<string[]>([]);

  const visible = leads.filter((l) => !doneIds.includes(l.id));

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
          No Won files waiting for a feasibility report
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((lead) => {
            const file = fileByLead[lead.id];
            return (
              <li
                key={lead.id}
                className="rounded-xl border border-[var(--border)] bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/leads/${lead.id}`}
                      className="font-semibold text-[var(--primary)] hover:underline"
                    >
                      {lead.name}
                    </Link>
                    <p className="text-xs text-[var(--text-muted)]">
                      {SALES_STAGE_LABELS[lead.sales_stage as SalesStage] ??
                        lead.sales_stage}
                      {lead.portal_code ? ` · Portal ${lead.portal_code}` : ""}
                      {lead.token_verified ? " · Token verified" : " · Token not verified"}
                    </p>
                    <p className="text-xs text-[var(--text-muted)]">{lead.phone}</p>
                  </div>
                </div>
                {canUpload && (
                  <div className="mt-3 space-y-2 border-t border-[var(--border-light)] pt-3">
                    {file?.url ? (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-semibold text-[var(--primary)]"
                        >
                          File ready — open
                        </a>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setFileByLead((s) => {
                              const next = { ...s };
                              delete next[lead.id];
                              return next;
                            })
                          }
                        >
                          Replace
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              setError(null);
                              try {
                                await submitFeasibilityReport({
                                  leadId: lead.id,
                                  title: "Grid Feasibility Report",
                                  notes: null,
                                  fileUrl: file.url,
                                  storagePath: file.path,
                                });
                                setDoneIds((ids) => [...ids, lead.id]);
                                router.refresh();
                              } catch (err) {
                                setError(friendlyUploadError(err));
                              }
                            })
                          }
                        >
                          {pending ? "Saving…" : "Save file"}
                        </Button>
                      </div>
                    ) : (
                      <ProofUploadField
                        folder="feasibility"
                        entityId={lead.id}
                        companyId={lead.company_id}
                        kind="mixed"
                        accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
                        hint="PDF, JPG, PNG, or WebP"
                        label="Choose feasibility file"
                        onUploaded={(url) => {
                          setFileByLead((s) => ({
                            ...s,
                            [lead.id]: {
                              url,
                              path: proofsStoragePathFromUrl(url),
                            },
                          }));
                          setError(null);
                        }}
                      />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
