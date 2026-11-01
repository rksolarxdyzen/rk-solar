"use client";

import { useEffect, useState, useTransition } from "react";
import { listLeadDocuments, uploadLeadDocument } from "@/actions/liaison";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  PORTAL_DOC_LABELS,
  PORTAL_DOC_TYPES,
  type PortalDocType,
} from "@/lib/domain/portal";
import { isSurveyPhotoDocType } from "@/lib/domain/survey-photos";
import { formatDateTime } from "@/lib/utils";
import { friendlyUploadError } from "@/lib/uploads/proof-mime";
import { prepareProofFileForUpload } from "@/lib/uploads/prepare-proof-file";

const STAFF_DOC_TYPES = PORTAL_DOC_TYPES.filter(
  (t) => t !== "customer_upload" && !isSurveyPhotoDocType(t)
);

type DocRow = {
  id: string;
  doc_type: string;
  title: string;
  file_url: string;
  created_at: string;
  uploaded_by_customer: boolean | null;
};

export function LeadDocsPanel({
  leadId,
  canUpload = false,
}: {
  leadId: string;
  canUpload?: boolean;
}) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState<PortalDocType>("other");
  const [pending, startTransition] = useTransition();

  async function refresh() {
    const rows = await listLeadDocuments(leadId);
    setDocs(rows as DocRow[]);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listLeadDocuments(leadId)
      .then((rows) => {
        if (!cancelled) setDocs(rows as DocRow[]);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load documents");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Documents shared with the customer portal, including survey site photos and files the
        customer uploaded.
      </p>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Loading documents…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No documents yet.</p>
      ) : (
        <ul className="space-y-2">
          {docs.map((doc) => {
            const isImage = /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(doc.file_url);
            return (
            <li
              key={doc.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-[var(--border-light)] bg-white p-3"
            >
              <div className="flex min-w-0 flex-1 gap-3">
                {isImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={doc.file_url}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg border border-[var(--border-light)] object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[var(--primary)] hover:underline"
                  >
                    {doc.title}
                  </a>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                    {PORTAL_DOC_LABELS[doc.doc_type as PortalDocType] ?? doc.doc_type}
                    {" · "}
                    {formatDateTime(doc.created_at)}
                  </p>
                </div>
              </div>
              {doc.uploaded_by_customer ? (
                <Badge variant="quote_accepted">Customer</Badge>
              ) : isSurveyPhotoDocType(doc.doc_type) ? (
                <Badge variant="contacted">Survey</Badge>
              ) : (
                <Badge variant="contacted">Staff</Badge>
              )}
            </li>
            );
          })}
        </ul>
      )}

      {canUpload && (
        <form
          className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
            const file = fileInput?.files?.[0];
            if (!file) {
              setError("Choose a file to upload");
              return;
            }
            setError(null);
            setOk(null);
            startTransition(async () => {
              try {
                const prepared = await prepareProofFileForUpload(file);
                const fd = new FormData();
                fd.set("leadId", leadId);
                fd.set("title", title);
                fd.set("docType", docType);
                fd.set("file", prepared);
                await uploadLeadDocument(fd);
                setTitle("");
                form.reset();
                setOk("Document uploaded and visible on the customer portal");
                await refresh();
              } catch (err) {
                setError(friendlyUploadError(err));
              }
            });
          }}
        >
          <p className="text-sm font-semibold text-[var(--text-dark)]">Upload a document</p>
          <div>
            <Label htmlFor="staff-doc-title">Title</Label>
            <Input
              id="staff-doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Invoice, self-declaration"
            />
          </div>
          <div>
            <Label htmlFor="staff-doc-type">Type</Label>
            <select
              id="staff-doc-type"
              className="w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm"
              value={docType}
              onChange={(e) => setDocType(e.target.value as PortalDocType)}
            >
              {STAFF_DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PORTAL_DOC_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="staff-doc-file">File</Label>
            <Input
              id="staff-doc-file"
              name="file"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
              required
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              JPG, PNG, or PDF · max 4 MB (large photos are compressed)
            </p>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {ok && <p className="text-sm text-[var(--success)]">{ok}</p>}
    </div>
  );
}
