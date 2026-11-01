"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea, Select } from "@/components/ui/input";
import { ProofUploadButton } from "@/components/ui/proof-upload-button";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/layout/page-header";
import {
  acceptServiceTicket,
  closeServiceTicket,
  enqueueCleaningReminders,
  forceAssignServiceTicket,
  rejectServiceTicket,
  staffRaiseServiceTicket,
  startServiceTicket,
} from "@/actions/tickets";
import {
  TICKET_STATUS_LABELS,
  type TicketStatus,
} from "@/lib/domain/maintenance";
import { formatDateTime } from "@/lib/utils";

type Engineer = {
  id: string;
  name: string;
  phone?: string | null;
  role?: string | null;
};

type TicketRow = {
  id: string;
  status: TicketStatus | string;
  description: string;
  assigned_to: string | null;
  created_at: string;
  closed_at: string | null;
  resolution_notes: string | null;
  lead?: { id: string; name: string; phone: string; portal_code?: string | null } | null;
  assignee?: { id: string; name: string } | null;
  offers?: {
    id: string;
    engineer_id: string;
    status: string;
    engineer?: { id: string; name: string } | null;
  }[];
  photos?: { id: string; file_url: string; caption: string | null }[];
};

type CustomerOption = { id: string; name: string; phone: string };

function isVideoUrl(url: string) {
  return /\.(mp4|mov|webm)(?:[?#]|$)/i.test(url);
}

export function MaintenanceWorkspace({
  tickets,
  engineers,
  customers,
  companyId,
  profileId,
  canAccept,
  canResolve,
  canForceAssign,
  canEnqueueCleaning,
  canRaiseTicket,
}: {
  tickets: TicketRow[];
  engineers: Engineer[];
  customers: CustomerOption[];
  companyId: string;
  profileId: string;
  canAccept: boolean;
  canResolve: boolean;
  canForceAssign: boolean;
  canEnqueueCleaning: boolean;
  canRaiseTicket?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const [proofUrls, setProofUrls] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raiseLeadId, setRaiseLeadId] = useState("");
  const [raiseDescription, setRaiseDescription] = useState("");
  const [raisePhotos, setRaisePhotos] = useState<string[]>([]);

  function refresh(msg: string) {
    setMessage(msg);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Others"
        title="Service"
        subtitle="Service tickets (first accept wins) + 15-day cleaning reminders"
        className="mb-0"
        actions={
          <>
            {canRaiseTicket && (
              <Button type="button" size="sm" onClick={() => setRaiseOpen(true)}>
                Raise ticket
              </Button>
            )}
            {canEnqueueCleaning && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    setError(null);
                    try {
                      const r = await enqueueCleaningReminders();
                      refresh(
                        r.enqueued
                          ? `Queued ${r.enqueued} cleaning reminder(s)`
                          : "No cleaning reminders due"
                      );
                    } catch (err) {
                      setError(err instanceof Error ? err.message : "Failed");
                    }
                  })
                }
              >
                Queue cleaning reminders
              </Button>
            )}
          </>
        }
      />

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {message && <p className="text-sm text-[var(--success)]">{message}</p>}

      {tickets.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
          No service tickets yet
        </p>
      ) : (
        <ul className="space-y-3">
          {tickets.map((ticket) => {
            const myOffer = ticket.offers?.find((o) => o.engineer_id === profileId);
            const isMine = ticket.assigned_to === profileId;
            const statusLabel =
              TICKET_STATUS_LABELS[ticket.status as TicketStatus] ?? ticket.status;

            return (
              <li
                key={ticket.id}
                className="rounded-xl border border-[var(--border)] bg-white p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    {ticket.lead ? (
                      <Link
                        href={`/leads/${ticket.lead.id}`}
                        className="font-semibold text-[var(--primary)] hover:underline"
                      >
                        {ticket.lead.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">Lead</span>
                    )}
                    <p className="text-xs text-[var(--text-muted)]">
                      {statusLabel}
                      {ticket.assignee ? ` · ${ticket.assignee.name}` : " · Unassigned"}
                      {" · "}
                      {formatDateTime(ticket.created_at)}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-body)]">{ticket.description}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canAccept &&
                      ticket.status === "raised" &&
                      myOffer?.status === "offered" && (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                setError(null);
                                try {
                                  await acceptServiceTicket(ticket.id);
                                  refresh("Ticket accepted");
                                } catch (err) {
                                  setError(
                                    err instanceof Error ? err.message : "Failed"
                                  );
                                }
                              })
                            }
                          >
                            Accept
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={pending}
                            onClick={() =>
                              startTransition(async () => {
                                setError(null);
                                try {
                                  await rejectServiceTicket(ticket.id);
                                  refresh("Offer rejected");
                                } catch (err) {
                                  setError(
                                    err instanceof Error ? err.message : "Failed"
                                  );
                                }
                              })
                            }
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    {canResolve && isMine && ticket.status === "accepted" && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            setError(null);
                            try {
                              await startServiceTicket(ticket.id);
                              refresh("Work started");
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Failed");
                            }
                          })
                        }
                      >
                        Start work
                      </Button>
                    )}
                  </div>
                </div>

                {ticket.offers && ticket.offers.length > 0 && (
                  <p className="text-xs text-[var(--text-muted)]">
                    Offers:{" "}
                    {ticket.offers
                      .map(
                        (o) =>
                          `${o.engineer?.name ?? "Engineer"} (${o.status})`
                      )
                      .join(" · ")}
                  </p>
                )}

                {canForceAssign && ticket.status === "raised" && !ticket.assigned_to && (
                  <div className="flex flex-wrap items-end gap-2 border-t border-[var(--border-light)] pt-3">
                    <div className="min-w-[160px] flex-1">
                      <Label>Force assign engineer</Label>
                      <select
                        className="mt-1 w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm"
                        value={assignTo[ticket.id] ?? ""}
                        onChange={(e) =>
                          setAssignTo((s) => ({ ...s, [ticket.id]: e.target.value }))
                        }
                      >
                        <option value="">Select…</option>
                        {engineers.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.role === "admin"
                              ? `${e.name} (Admin)`
                              : e.role === "service_supervisor"
                                ? `${e.name} (Supervisor)`
                                : e.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending || !assignTo[ticket.id]}
                      onClick={() =>
                        startTransition(async () => {
                          setError(null);
                          try {
                            await forceAssignServiceTicket({
                              ticketId: ticket.id,
                              engineerId: assignTo[ticket.id],
                            });
                            refresh("Engineer assigned");
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed");
                          }
                        })
                      }
                    >
                      Assign
                    </Button>
                  </div>
                )}

                {canResolve &&
                  isMine &&
                  (ticket.status === "accepted" || ticket.status === "in_progress") && (
                    <div className="space-y-2 border-t border-[var(--border-light)] pt-3">
                      <Label>Solution proof photos/videos (select up to 4 at once)</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        <ProofUploadButton
                          folder="tickets"
                          entityId={ticket.id}
                          companyId={companyId}
                          label="Upload proofs"
                          allowVideo
                          multiple
                          maxFiles={4}
                          onUploaded={(url) =>
                            setProofUrls((s) => ({
                              ...s,
                              [ticket.id]: [...(s[ticket.id] ?? []), url],
                            }))
                          }
                        />
                      </div>
                      {(proofUrls[ticket.id] ?? []).length > 0 && (
                        <ul className="space-y-1 text-xs">
                          {(proofUrls[ticket.id] ?? []).map((url) => (
                            <li
                              key={url}
                              className="flex items-center justify-between gap-2"
                            >
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[var(--primary)] hover:underline"
                              >
                                Proof attached
                              </a>
                              <button
                                type="button"
                                className="font-semibold text-[var(--error)]"
                                onClick={() =>
                                  setProofUrls((s) => ({
                                    ...s,
                                    [ticket.id]: (s[ticket.id] ?? []).filter(
                                      (u) => u !== url
                                    ),
                                  }))
                                }
                              >
                                Remove
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Label>Resolution notes</Label>
                      <Textarea
                        value={notes[ticket.id] ?? ""}
                        onChange={(e) =>
                          setNotes((s) => ({ ...s, [ticket.id]: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending || (proofUrls[ticket.id] ?? []).length < 1}
                        onClick={() =>
                          startTransition(async () => {
                            setError(null);
                            try {
                              await closeServiceTicket({
                                ticketId: ticket.id,
                                proofUrls: proofUrls[ticket.id] ?? [],
                                resolutionNotes: notes[ticket.id],
                              });
                              refresh("Ticket closed");
                            } catch (err) {
                              setError(err instanceof Error ? err.message : "Failed");
                            }
                          })
                        }
                      >
                        Close ticket
                      </Button>
                    </div>
                  )}

                {ticket.photos && ticket.photos.length > 0 && (
                  <ul className="text-xs text-[var(--text-muted)]">
                    {ticket.photos.map((p) => (
                      <li key={p.id}>
                        <a
                          href={p.file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--primary)] hover:underline"
                        >
                      {isVideoUrl(p.file_url) ? "Video proof" : "Photo proof"}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={raiseOpen}
        onClose={() => setRaiseOpen(false)}
        title="Raise service ticket"
        subtitle="Create a ticket for a won customer"
      >
        <div className="space-y-3">
          <div>
            <Label>Customer</Label>
            <Select value={raiseLeadId} onChange={(e) => setRaiseLeadId(e.target.value)}>
              <option value="">Select customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.phone}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Issue</Label>
            <Textarea
              value={raiseDescription}
              onChange={(e) => setRaiseDescription(e.target.value)}
              rows={4}
              placeholder="Describe the issue…"
            />
          </div>
          <div>
            <Label>Issue photo or video (required)</Label>
            <p className="mb-2 text-xs text-[var(--text-muted)]">
              Upload at least one photo or video. Videos must be 59 seconds or shorter.
            </p>
            <ProofUploadButton
              folder="tickets"
              entityId={raiseLeadId || "raise"}
              companyId={companyId}
              label={raisePhotos.length ? "Add photo/video" : "Upload photo/video"}
              allowVideo
              onUploaded={(url) => setRaisePhotos((prev) => [...prev, url])}
            />
            {raisePhotos.length > 0 && (
              <ul className="mt-2 space-y-1">
                {raisePhotos.map((url) => (
                  <li key={url} className="flex items-center justify-between gap-2 text-xs">
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-[var(--primary)] hover:underline"
                    >
                      Photo/video uploaded
                    </a>
                    <button
                      type="button"
                      className="shrink-0 font-semibold text-[var(--error)]"
                      onClick={() => setRaisePhotos((prev) => prev.filter((u) => u !== url))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRaiseOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                pending ||
                !raiseLeadId ||
                raiseDescription.trim().length < 5 ||
                raisePhotos.length < 1
              }
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    await staffRaiseServiceTicket({
                      leadId: raiseLeadId,
                      description: raiseDescription.trim(),
                      photoUrls: raisePhotos,
                    });
                    setRaiseOpen(false);
                    setRaiseLeadId("");
                    setRaiseDescription("");
                    setRaisePhotos([]);
                    refresh("Ticket raised");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed to raise ticket");
                  }
                })
              }
            >
              {pending ? "Saving…" : "Raise ticket"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
