"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  portalMarkMeterInstalled,
  portalMarkSubsidyReceived,
  portalUploadDocument,
} from "@/actions/liaison";
import { portalUpdateReferrer } from "@/actions/portal";
import { portalRaiseServiceTicket, portalUploadTicketPhoto } from "@/actions/tickets";
import { BrandMark } from "@/components/brand/brand-mark";
import { PoweredByDyzen } from "@/components/brand/powered-by-dyzen";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  daysUntilSubsidyDue,
  isSubsidyTimerOverdue,
  PORTAL_DOC_LABELS,
  summarizePortalPayments,
  type PortalDocument,
  type PortalSession,
  type PortalTicket,
} from "@/lib/domain/portal";
import {
  PAYMENT_MILESTONE_LABELS,
  PAYMENT_STATUS_LABELS,
  type PaymentMilestone,
  type PaymentVerificationStatus,
} from "@/lib/domain/payments";
import {
  TICKET_STATUS_LABELS,
  type TicketStatus,
} from "@/lib/domain/maintenance";
import { SALES_STAGE_LABELS } from "@/lib/domain/workflow";
import type { SalesStage } from "@/lib/domain/workflow";
import { formatCurrency, formatDate, formatDateTime, cn } from "@/lib/utils";
import { friendlyUploadError } from "@/lib/uploads/proof-mime";
import {
  getVideoDurationSeconds,
  isVideoFile,
  prepareProofFileForUpload,
} from "@/lib/uploads/prepare-proof-file";

const PORTAL_TABS = [
  { id: "overview", label: "Overview" },
  { id: "documents", label: "Documents" },
  { id: "complaints", label: "Complaints" },
] as const;

type PortalTab = (typeof PORTAL_TABS)[number]["id"];

export function PortalDashboard({
  session,
  phone,
}: {
  session: PortalSession;
  phone: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<PortalTab>("overview");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const { lead, documents, quote } = session;
  const overdue = isSubsidyTimerOverdue(lead);
  const daysLeft = daysUntilSubsidyDue(lead.subsidy_timer_due_at);
  const stageLabel =
    SALES_STAGE_LABELS[lead.sales_stage as SalesStage] ?? lead.sales_stage;

  function refresh(msg: string) {
    setOk(msg);
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <header className="rounded-2xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <div className="border-b border-[var(--border-light)] pb-4">
          <BrandMark imageClassName="w-56 sm:w-64" />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-[var(--text-dark)]">{lead.name}</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {stageLabel}
          {lead.portal_code ? ` · Code ${lead.portal_code}` : ""}
        </p>
        {(lead.city || lead.address) && (
          <p className="mt-1 text-sm text-[var(--text-body)]">
            {[lead.address, lead.city].filter(Boolean).join(", ")}
          </p>
        )}
      </header>

      <PortalMilestones lead={lead} />

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-white p-1">
        {PORTAL_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition",
              tab === t.id
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--text-dark)]"
            )}
          >
            {t.label}
            {t.id === "documents" && documents.length > 0 ? ` (${documents.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="space-y-4">
          <section className="space-y-2 rounded-2xl border border-[var(--border)] bg-white p-5">
            <h2 className="font-semibold text-[var(--text-dark)]">Project status</h2>
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-muted)]">Installation</dt>
                <dd>{formatDateTime(lead.installation_completed_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-muted)]">Meter</dt>
                <dd>{formatDateTime(lead.meter_installed_at)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--text-muted)]">Subsidy</dt>
                <dd>{formatDateTime(lead.subsidy_received_at)}</dd>
              </div>
              {lead.subsidy_timer_due_at && !lead.subsidy_received_at && (
                <p
                  className={`text-xs ${overdue ? "font-semibold text-[var(--error)]" : "text-[var(--text-muted)]"}`}
                >
                  Expected subsidy update by {formatDateTime(lead.subsidy_timer_due_at)}
                  {daysLeft != null ? ` (${daysLeft} days left)` : ""}
                </p>
              )}
              {lead.completion_certificate_url && (
                <a
                  href={lead.completion_certificate_url}
                  className="text-sm font-semibold text-[var(--primary)]"
                  target="_blank"
                  rel="noreferrer"
                >
                  Download completion certificate
                </a>
              )}
            </dl>
          </section>

          <PortalPaymentsCard
            quote={quote}
            payments={session.payments ?? []}
            settlementDiscount={session.settlementDiscount ?? 0}
          />

          <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
            <h2 className="font-semibold text-[var(--text-dark)]">Complaints</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Raise a complaint or ticket for panel / inverter issues, or view the ones
              you already submitted for this project.
            </p>
            <p className="text-sm text-[var(--text-body)]">
              {(session.tickets ?? []).length === 0
                ? "No complaints yet."
                : `${session.tickets!.length} complaint${session.tickets!.length === 1 ? "" : "s"} on file.`}
            </p>
            <Button type="button" size="sm" onClick={() => setTab("complaints")}>
              Raise or view complaints
            </Button>
          </section>

          <PortalReferrerCard
            key={`${lead.referrer_name ?? ""}-${lead.referrer_phone ?? ""}`}
            portalCode={lead.portal_code!}
            phone={phone}
            referrerName={lead.referrer_name ?? ""}
            referrerPhone={lead.referrer_phone ?? ""}
            onSaved={(msg) => refresh(msg)}
            onError={(msg) => setError(msg || null)}
          />

          {!lead.meter_installed_at &&
            (lead.sales_stage === "liaison_in_progress" ||
              lead.sales_stage === "installation_completed") && (
              <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
                <h2 className="font-semibold">Has the net meter been installed?</h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Confirm only after Discom has installed your bidirectional meter.
                </p>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setError(null);
                      try {
                        await portalMarkMeterInstalled({
                          portalCode: lead.portal_code!,
                          phone,
                        });
                        refresh("Thank you — meter confirmed. Subsidy timer started.");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed");
                      }
                    })
                  }
                >
                  Yes, meter is installed
                </Button>
              </section>
            )}

          {Boolean(lead.meter_installed_at) &&
            !lead.subsidy_received_at &&
            (lead.sales_stage === "subsidy_pending" ||
              lead.sales_stage === "meter_installed") && (
              <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
                <h2 className="font-semibold">Have you received the subsidy?</h2>
                <p className="text-sm text-[var(--text-muted)]">
                  Confirm when the subsidy amount appears in your bank account.
                </p>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setError(null);
                      try {
                        await portalMarkSubsidyReceived({
                          portalCode: lead.portal_code!,
                          phone,
                        });
                        refresh("Noted — our accounts team will verify.");
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Failed");
                      }
                    })
                  }
                >
                  Yes, subsidy received
                </Button>
              </section>
            )}
        </div>
      )}

      {tab === "documents" && (
        <PortalDocumentsSection
          portalCode={lead.portal_code!}
          phone={phone}
          documents={documents}
          onDone={refresh}
          pending={pending}
          setPendingError={setError}
        />
      )}

      {tab === "complaints" && (
        <PortalServiceSection
          portalCode={lead.portal_code!}
          phone={phone}
          tickets={session.tickets ?? []}
          cleaningNextDueAt={lead.cleaning_next_due_at}
          onDone={refresh}
          pending={pending}
          setPendingError={setError}
        />
      )}

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {ok && <p className="text-sm text-[var(--success)]">{ok}</p>}
      <PoweredByDyzen className="pt-2" />
    </div>
  );
}

function PortalReferrerCard({
  portalCode,
  phone,
  referrerName: initialName,
  referrerPhone: initialPhone,
  onSaved,
  onError,
}: {
  portalCode: string;
  phone: string;
  referrerName: string;
  referrerPhone: string;
  onSaved: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [referrerName, setReferrerName] = useState(initialName);
  const [referrerPhone, setReferrerPhone] = useState(initialPhone);

  return (
    <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
      <div>
        <h2 className="font-semibold text-[var(--text-dark)]">Reference person</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Optional — who referred you to RK Bhabhor?
        </p>
      </div>
      <div className="space-y-3">
        <div>
          <Label>Reference name</Label>
          <Input
            value={referrerName}
            onChange={(e) => setReferrerName(e.target.value)}
            placeholder="Full name"
            disabled={pending}
          />
        </div>
        <div>
          <Label>Reference phone</Label>
          <Input
            value={referrerPhone}
            onChange={(e) => setReferrerPhone(e.target.value)}
            placeholder="Mobile number"
            inputMode="tel"
            disabled={pending}
          />
        </div>
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            onError("");
            startTransition(async () => {
              try {
                await portalUpdateReferrer({
                  portalCode,
                  phone,
                  referrerName,
                  referrerPhone,
                });
                onSaved("Reference details saved");
              } catch (e) {
                onError(e instanceof Error ? e.message : "Could not save reference");
              }
            });
          }}
        >
          {pending ? "Saving…" : "Save reference"}
        </Button>
      </div>
    </section>
  );
}

function PortalPaymentsCard({
  quote,
  payments,
  settlementDiscount = 0,
}: {
  quote: PortalSession["quote"];
  payments: PortalSession["payments"];
  settlementDiscount?: number;
}) {
  const summary = summarizePortalPayments(quote?.grand_total, payments, settlementDiscount);
  if (!quote && payments.length === 0) return null;

  const paidPercent =
    summary.projectTotal && summary.projectTotal > 0
      ? Math.min(100, Math.round((summary.paid / summary.projectTotal) * 100))
      : null;

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
      <div>
        <h2 className="font-semibold text-[var(--text-dark)]">Payments</h2>
        {quote && (
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {quote.quotation_no}
            {quote.grand_total != null ? ` · ${formatCurrency(Number(quote.grand_total))}` : ""}
            {summary.discount > 0 ? ` · Discount ${formatCurrency(summary.discount)}` : ""}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-[var(--success-light)] p-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--success)]">
            Paid
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--text-dark)]">
            {formatCurrency(summary.paid)}
          </p>
        </div>
        <div className="rounded-xl bg-[var(--warn-light)] p-3">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--warn)]">
            Balance due
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--text-dark)]">
            {summary.remaining == null ? "—" : formatCurrency(summary.remaining)}
          </p>
        </div>
      </div>

      {paidPercent != null && (
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]">
            <div
              className="h-full rounded-full bg-[var(--success)]"
              style={{ width: `${paidPercent}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {paidPercent}% of project total received
            {summary.pending > 0
              ? ` · ${formatCurrency(summary.pending)} awaiting confirmation`
              : ""}
          </p>
        </div>
      )}

      {summary.remaining == null && (
        <p className="text-xs text-[var(--text-muted)]">
          Remaining balance will show once your quotation total is on file.
          {summary.pending > 0
            ? ` ${formatCurrency(summary.pending)} is awaiting confirmation.`
            : ""}
        </p>
      )}

      {payments.filter((p) => p.verification_status !== "rejected").length > 0 && (
        <ul className="space-y-2">
          {payments
            .filter((p) => p.verification_status !== "rejected")
            .map((p) => (
              <li
                key={`${p.milestone}-${p.paid_at ?? p.amount}`}
                className="flex items-start justify-between gap-2 text-sm"
              >
                <div>
                  <p className="font-medium text-[var(--text-dark)]">
                    {PAYMENT_MILESTONE_LABELS[p.milestone as PaymentMilestone] ?? p.milestone}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {PAYMENT_STATUS_LABELS[p.verification_status as PaymentVerificationStatus] ??
                      p.verification_status}
                    {p.paid_at ? ` · ${formatDate(p.paid_at)}` : ""}
                  </p>
                </div>
                <p className="font-semibold text-[var(--text-dark)]">
                  {formatCurrency(Number(p.amount))}
                </p>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

function PortalMilestones({ lead }: { lead: PortalSession["lead"] }) {
  const steps = [
    { id: "install", label: "Installed", done: Boolean(lead.installation_completed_at) },
    { id: "meter", label: "Meter", done: Boolean(lead.meter_installed_at) },
    { id: "subsidy", label: "Subsidy", done: Boolean(lead.subsidy_received_at) },
    {
      id: "done",
      label: "Complete",
      done: lead.sales_stage === "completed" || Boolean(lead.subsidy_verified_at),
    },
  ];
  const currentIndex = steps.findIndex((s) => !s.done);

  return (
    <ol className="grid grid-cols-4 gap-1 rounded-2xl border border-[var(--border)] bg-white p-3">
      {steps.map((step, index) => {
        const current = currentIndex === index;
        return (
          <li key={step.id} className="flex flex-col items-center gap-1 text-center">
            <span
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                step.done
                  ? "bg-[var(--success)] text-white"
                  : current
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--bg)] text-[var(--text-muted)]"
              )}
            >
              {step.done ? "✓" : index + 1}
            </span>
            <span
              className={cn(
                "text-[0.65rem] font-semibold leading-tight",
                step.done || current ? "text-[var(--text-dark)]" : "text-[var(--text-muted)]"
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function PortalDocumentsSection({
  portalCode,
  phone,
  documents,
  onDone,
  pending,
  setPendingError,
}: {
  portalCode: string;
  phone: string;
  documents: PortalDocument[];
  onDone: (msg: string) => void;
  pending: boolean;
  setPendingError: (msg: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [localPending, startLocal] = useTransition();
  const busy = pending || localPending;

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
      <div>
        <h2 className="font-semibold text-[var(--text-dark)]">Documents</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          View invoices and files from our team, or upload any document we should have on file.
        </p>
      </div>

      {documents.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No documents yet. You can upload one below.</p>
      ) : (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="rounded-lg border border-[var(--border-light)] p-3"
            >
              <a
                href={doc.file_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-[var(--primary)] hover:underline"
              >
                {doc.title}
              </a>
              <p className="text-xs text-[var(--text-muted)]">
                {PORTAL_DOC_LABELS[doc.doc_type as keyof typeof PORTAL_DOC_LABELS] ??
                  doc.doc_type}
                {doc.uploaded_by_customer ? " · Uploaded by you" : ""}
                {" · "}
                {formatDateTime(doc.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form
        className="space-y-3 border-t border-[var(--border-light)] pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fileInput = form.elements.namedItem("file") as HTMLInputElement | null;
          const file = fileInput?.files?.[0];
          if (!file) {
            setPendingError("Choose a file to upload");
            return;
          }
          setPendingError(null);
          startLocal(async () => {
            try {
              const prepared = await prepareProofFileForUpload(file);
              const fd = new FormData();
              fd.set("portalCode", portalCode);
              fd.set("phone", phone);
              fd.set("title", title);
              fd.set("file", prepared);
              await portalUploadDocument(fd);
              setTitle("");
              form.reset();
              onDone("Document uploaded — our team can see it on your project.");
            } catch (err) {
              setPendingError(friendlyUploadError(err));
            }
          });
        }}
      >
        <p className="text-sm font-semibold text-[var(--text-dark)]">Upload a document</p>
        <div>
          <Label htmlFor="portal-doc-title">Title (optional)</Label>
          <Input
            id="portal-doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Aadhaar, electricity bill"
          />
        </div>
        <div>
          <Label htmlFor="portal-doc-file">File</Label>
          <Input
            id="portal-doc-file"
            name="file"
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
            required
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            JPG, PNG, or PDF · max 4 MB (large photos are compressed)
          </p>
        </div>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Uploading…" : "Upload document"}
        </Button>
      </form>
    </section>
  );
}

function PortalServiceSection({
  portalCode,
  phone,
  tickets,
  cleaningNextDueAt,
  onDone,
  pending,
  setPendingError,
}: {
  portalCode: string;
  phone: string;
  tickets: PortalTicket[];
  cleaningNextDueAt?: string | null;
  onDone: (msg: string) => void;
  pending: boolean;
  setPendingError: (msg: string | null) => void;
}) {
  const [description, setDescription] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [localPending, startLocal] = useTransition();
  const busy = pending || localPending || uploading;

  return (
    <>
      <section className="space-y-2 rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="font-semibold text-[var(--text-dark)]">Panel care</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Clean your panels every ~15 days for best yield.
          {cleaningNextDueAt
            ? ` Next reminder around ${formatDateTime(cleaningNextDueAt)}.`
            : ""}
        </p>
        <p className="text-sm text-[var(--text-body)]">
          Know someone going solar? Ask our team for your referral link.
        </p>
      </section>

      <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-5">
        <h2 className="font-semibold text-[var(--text-dark)]">Your complaints</h2>
        <p className="text-sm text-[var(--text-muted)]">
          Only complaints for this project are shown. Raise a new complaint below.
        </p>
        {tickets.length > 0 && (
          <ul className="space-y-2">
            {tickets.map((t) => (
              <li key={t.id} className="rounded-lg border border-[var(--border-light)] p-3">
                <p className="text-sm font-medium">{t.description}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {TICKET_STATUS_LABELS[t.status as TicketStatus] ?? t.status}
                  {" · "}
                  {formatDateTime(t.created_at)}
                </p>
                {t.resolution_notes && (
                  <p className="mt-1 text-xs text-[var(--text-body)]">{t.resolution_notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setPendingError(null);
            if (photoUrls.length < 1) {
              setPendingError("Add at least one photo of the issue");
              return;
            }
            startLocal(async () => {
              try {
                await portalRaiseServiceTicket({
                  portalCode,
                  phone,
                  description,
                  photoUrls,
                });
                setDescription("");
                setPhotoUrls([]);
                onDone("Complaint raised — our team will respond soon.");
              } catch (err) {
                setPendingError(err instanceof Error ? err.message : "Failed");
              }
            });
          }}
        >
          <Label htmlFor="ticket-desc">Describe the issue</Label>
          <Textarea
            id="ticket-desc"
            required
            minLength={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Inverter showing fault code…"
          />
          <div>
            <Label htmlFor="ticket-photo">
              Issue photos or video (required — select up to 4 at once)
            </Label>
            <input
              id="ticket-photo"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm"
              disabled={busy}
              className="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--primary-light)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[var(--primary)]"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []).slice(0, 4);
                e.target.value = "";
                if (picked.length === 0) return;
                setPendingError(null);
                setUploading(true);
                void (async () => {
                  try {
                    const urls: string[] = [];
                    for (const file of picked) {
                      const prepared = await prepareProofFileForUpload(file, {
                        allowVideo: true,
                      });
                      const fd = new FormData();
                      fd.set("portalCode", portalCode);
                      fd.set("phone", phone);
                      fd.set("file", prepared);
                      if (isVideoFile(prepared)) {
                        fd.set(
                          "durationSeconds",
                          String(await getVideoDurationSeconds(prepared))
                        );
                      }
                      const { publicUrl } = await portalUploadTicketPhoto(fd);
                      urls.push(publicUrl);
                    }
                    setPhotoUrls((prev) => [...prev, ...urls]);
                  } catch (err) {
                    setPendingError(friendlyUploadError(err));
                  } finally {
                    setUploading(false);
                  }
                })();
              }}
            />
            {uploading && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">Uploading photos…</p>
            )}
            {photoUrls.length > 0 && (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {photoUrls.length} photo{photoUrls.length === 1 ? "" : "s"} selected
              </p>
            )}
            {photoUrls.length > 0 && (
              <ul className="mt-2 space-y-1">
                {photoUrls.map((url, idx) => (
                  <li key={url} className="flex items-center justify-between gap-2 text-xs">
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--primary)] hover:underline"
                    >
                      Attachment {idx + 1}
                    </a>
                    <button
                      type="button"
                      className="font-semibold text-[var(--error)]"
                      onClick={() => setPhotoUrls((prev) => prev.filter((u) => u !== url))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button type="submit" size="sm" disabled={busy || photoUrls.length < 1}>
            Raise complaint
          </Button>
        </form>
      </section>
    </>
  );
}
