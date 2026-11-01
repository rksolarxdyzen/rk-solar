"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { DealerCommissionPanel } from "@/components/dealers/dealer-commission-panel";
import { FileDropZone, toDropFiles, type DropFile } from "@/components/ui/file-drop-zone";
import {
  markMeterInstalled,
  markSubsidyReceived,
  uploadLeadDocument,
  verifySubsidy,
} from "@/actions/liaison";
import { friendlyUploadError, PROOF_UPLOAD_MAX_BYTES } from "@/lib/uploads/proof-mime";
import { prepareProofFileForUpload } from "@/lib/uploads/prepare-proof-file";
import {
  daysUntilSubsidyDue,
  isSubsidyTimerOverdue,
  PORTAL_DOC_TYPES,
  PORTAL_DOC_LABELS,
} from "@/lib/domain/portal";
import type { LeadWithRelations } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/utils";

const PORTAL_DOC_EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "webp"];
const PORTAL_DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

const LIAISON_STAGES = new Set([
  "installation_completed",
  "liaison_in_progress",
  "meter_installed",
  "subsidy_pending",
  "subsidy_received_pending_accounts",
  "completed",
]);

export function LiaisonPanel({
  lead,
  onDone,
  canLiaison = false,
  canVerifySubsidy = false,
  canManageDocs = false,
  canSubmitCommission = false,
  canApproveCommission = false,
  canAssignDealer = false,
}: {
  lead: LeadWithRelations;
  onDone: () => void;
  canLiaison?: boolean;
  canVerifySubsidy?: boolean;
  canManageDocs?: boolean;
  canSubmitCommission?: boolean;
  canApproveCommission?: boolean;
  canAssignDealer?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [bankRef, setBankRef] = useState("");
  const [certUrl, setCertUrl] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docFiles, setDocFiles] = useState<DropFile[]>([]);
  const [docType, setDocType] = useState<(typeof PORTAL_DOC_TYPES)[number]>("invoice");
  const [promptCommission, setPromptCommission] = useState(false);

  if (!LIAISON_STAGES.has(lead.sales_stage) && !lead.installation_completed_at) {
    return null;
  }

  function setDocStatus(id: string, status: DropFile["status"], message?: string) {
    setDocFiles((list) =>
      list.map((f) => (f.id === id ? { ...f, status, error: message } : f))
    );
  }

  function addDocFiles(files: File[]) {
    const next = toDropFiles(files).map((item): DropFile => {
      const ext = item.file.name.split(".").pop()?.toLowerCase() ?? "";
      if (!PORTAL_DOC_EXTENSIONS.includes(ext)) {
        return { ...item, status: "failed", error: "Only PDF, JPG, PNG or WebP files" };
      }
      if (ext === "pdf" && item.file.size > PROOF_UPLOAD_MAX_BYTES) {
        return { ...item, status: "failed", error: "PDF is over 4 MB — compress or split it" };
      }
      return item;
    });
    setDocFiles((list) => [...list, ...next]);
  }

  const overdue = isSubsidyTimerOverdue(lead);
  const daysLeft = daysUntilSubsidyDue(lead.subsidy_timer_due_at);

  return (
    <div className="space-y-4">
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-4">
      <div>
        <h3 className="font-semibold text-[var(--text-dark)]">Discom / Subsidy</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Portal code:{" "}
          <span className="font-mono font-semibold text-[var(--primary)]">
            {lead.portal_code ?? "—"}
          </span>
          {lead.portal_code && (
            <>
              {" "}
              ·{" "}
              <a
                className="font-semibold text-[var(--primary)]"
                href={`/portal/${lead.portal_code}`}
                target="_blank"
                rel="noreferrer"
              >
                Open portal
              </a>
            </>
          )}
        </p>
        {lead.subsidy_timer_due_at && !lead.subsidy_received_at && (
          <p
            className={`mt-1 text-xs ${overdue ? "text-[var(--error)]" : "text-[var(--text-muted)]"}`}
          >
            Subsidy timer due {formatDateTime(lead.subsidy_timer_due_at)}
            {daysLeft != null ? ` (${daysLeft}d)` : ""}
            {overdue ? " — OVERDUE" : ""}
          </p>
        )}
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-[var(--text-muted)]">Meter installed</dt>
          <dd>{formatDateTime(lead.meter_installed_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">Subsidy received</dt>
          <dd>{formatDateTime(lead.subsidy_received_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">Subsidy verified</dt>
          <dd>{formatDateTime(lead.subsidy_verified_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">Certificate</dt>
          <dd className="truncate">
            {lead.completion_certificate_url ? (
              <a
                href={lead.completion_certificate_url}
                className="text-[var(--primary)]"
                target="_blank"
                rel="noreferrer"
              >
                View
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      {canLiaison &&
        (lead.sales_stage === "liaison_in_progress" ||
          lead.sales_stage === "installation_completed") && (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  await markMeterInstalled({ leadId: lead.id });
                  setOk("Meter marked installed — 15-day subsidy timer started");
                  onDone();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed");
                }
              })
            }
          >
            Mark meter installed
          </Button>
        )}

      {canLiaison &&
        (lead.sales_stage === "subsidy_pending" ||
          lead.sales_stage === "meter_installed") &&
        Boolean(lead.meter_installed_at) &&
        !lead.subsidy_received_at && (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  await markSubsidyReceived({ leadId: lead.id });
                  setOk("Subsidy marked received — awaiting Accounts");
                  onDone();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed");
                }
              })
            }
          >
            Mark subsidy received
          </Button>
        )}

      {canVerifySubsidy &&
        lead.sales_stage === "subsidy_received_pending_accounts" && (
          <div className="space-y-2 border-t border-[var(--border-light)] pt-3">
            <Label>Bank reference</Label>
            <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
            <Label>Certificate URL (optional)</Label>
            <Input value={certUrl} onChange={(e) => setCertUrl(e.target.value)} />
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    const result = await verifySubsidy({
                      leadId: lead.id,
                      bankReference: bankRef,
                      certificateUrl: certUrl || null,
                    });
                    setOk("Project completed");
                    if (result.needsCommissionForm) setPromptCommission(true);
                    onDone();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed");
                  }
                })
              }
            >
              Verify subsidy & complete
            </Button>
          </div>
        )}

      {canManageDocs && lead.sales_stage !== "completed" && (
        <form
          className="space-y-2 border-t border-[var(--border-light)] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const queue = docFiles.filter((f) => f.status === "queued");
            if (queue.length === 0) {
              setError("Add at least one file to upload");
              return;
            }
            setError(null);
            setOk(null);
            startTransition(async () => {
              let added = 0;
              const prefix = docTitle.trim();
              for (const item of queue) {
                setDocStatus(item.id, "uploading");
                try {
                  const prepared = await prepareProofFileForUpload(item.file, { kind: "mixed" });
                  const baseName = item.file.name.replace(/\.[^.]+$/, "");
                  const title =
                    queue.length === 1
                      ? prefix || baseName
                      : prefix
                        ? `${prefix} — ${baseName}`
                        : baseName;
                  const fd = new FormData();
                  fd.set("leadId", lead.id);
                  fd.set("docType", docType);
                  fd.set("title", title);
                  fd.set("file", prepared);
                  await uploadLeadDocument(fd);
                  setDocStatus(item.id, "done");
                  added += 1;
                } catch (err) {
                  setDocStatus(item.id, "failed", friendlyUploadError(err));
                }
              }
              if (added > 0) {
                setOk(
                  `${added} document${added === 1 ? "" : "s"} added to portal`
                );
                setDocTitle("");
                setDocFiles((list) => list.filter((f) => f.status !== "done"));
                onDone();
              }
            });
          }}
        >
          <p className="text-sm font-semibold">Add portal document</p>
          <select
            className="w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm"
            value={docType}
            onChange={(e) =>
              setDocType(e.target.value as (typeof PORTAL_DOC_TYPES)[number])
            }
          >
            {PORTAL_DOC_TYPES.filter((t) => t !== "customer_upload").map((t) => (
              <option key={t} value={t}>
                {PORTAL_DOC_LABELS[t]}
              </option>
            ))}
          </select>
          <Input
            placeholder={
              docFiles.length > 1
                ? "Title prefix (optional) — file names are used"
                : "Title (optional) — defaults to the file name"
            }
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
          />
          <FileDropZone
            files={docFiles}
            onAdd={addDocFiles}
            onRemove={(id) => setDocFiles((list) => list.filter((f) => f.id !== id))}
            accept={PORTAL_DOC_ACCEPT}
            disabled={pending}
            hint="PDF, JPG, PNG or WebP · max 4 MB each (large photos are compressed)"
          />
          <Button
            type="submit"
            size="sm"
            disabled={pending || !docFiles.some((f) => f.status === "queued")}
          >
            {pending ? "Uploading…" : "Upload to portal"}
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {ok && <p className="text-sm text-[var(--success)]">{ok}</p>}
    </div>

    {(canAssignDealer ||
      canSubmitCommission ||
      canApproveCommission ||
      lead.sales_stage === "completed" ||
      promptCommission) && (
      <DealerCommissionPanel
        leadId={lead.id}
        dealerId={lead.dealer_id}
        salesStage={promptCommission ? "completed" : lead.sales_stage}
        forceOpen={promptCommission}
        canSubmit={canSubmitCommission}
        canApprove={canApproveCommission}
        canAssign={canAssignDealer}
        onDone={onDone}
      />
    )}
    </div>
  );
}
