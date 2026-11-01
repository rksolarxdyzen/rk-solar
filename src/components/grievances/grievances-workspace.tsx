"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/layout/page-header";
import { ProofUploadButton } from "@/components/ui/proof-upload-button";
import {
  addGrievanceAttachment,
  assignGrievance,
  escalateGrievance,
  raiseGrievance,
  resolveGrievance,
  startGrievance,
} from "@/actions/grievances";
import {
  GRIEVANCE_CATEGORIES,
  GRIEVANCE_CATEGORY_LABELS,
  GRIEVANCE_PRIORITIES,
  GRIEVANCE_PRIORITY_LABELS,
  GRIEVANCE_STATUS_LABELS,
  OPEN_GRIEVANCE_STATUSES,
  type GrievanceCategory,
  type GrievancePriority,
  type GrievanceStatus,
} from "@/lib/domain/grievances";
import { formatDateTime } from "@/lib/utils";

type Staff = { id: string; name: string; role?: string | null };

type Attachment = {
  id: string;
  file_url: string;
  caption: string | null;
  created_at?: string;
};

export type GrievanceRow = {
  id: string;
  title: string;
  description: string;
  category: GrievanceCategory | string;
  priority: GrievancePriority | string;
  status: GrievanceStatus | string;
  raised_by: string;
  assigned_to: string | null;
  resolution_notes: string | null;
  escalated_at: string | null;
  resolved_at: string | null;
  created_at: string;
  raiser?: { id: string; name: string; role?: string | null } | null;
  assignee?: { id: string; name: string; role?: string | null } | null;
  attachments?: Attachment[];
};

function priorityTone(priority: string) {
  if (priority === "urgent") return "bg-[var(--error-light)] text-[var(--error)]";
  if (priority === "high") return "bg-orange-50 text-orange-800";
  if (priority === "low") return "bg-[var(--bg)] text-[var(--text-muted)]";
  return "bg-[var(--primary-light)] text-[var(--primary)]";
}

function statusTone(status: string) {
  if (status === "resolved") return "text-[var(--success)]";
  if (status === "escalated") return "text-[var(--error)]";
  if (status === "in_progress") return "text-[var(--primary)]";
  return "text-[var(--text-muted)]";
}

export function GrievancesWorkspace({
  grievances,
  staff,
  profileId,
  canRaise,
  canManage,
}: {
  grievances: GrievanceRow[];
  staff: Staff[];
  profileId: string;
  canRaise: boolean;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all" | "mine">("open");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [raiseOpen, setRaiseOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<GrievanceCategory>("operations");
  const [priority, setPriority] = useState<GrievancePriority>("medium");
  const [assignOnRaise, setAssignOnRaise] = useState("");
  const [raiseFiles, setRaiseFiles] = useState<string[]>([]);
  const [raiseDraftId] = useState(() => crypto.randomUUID());

  const [resolveNotes, setResolveNotes] = useState("");
  const [escalateNote, setEscalateNote] = useState("");
  const [assignTo, setAssignTo] = useState("");

  const selected = useMemo(
    () => grievances.find((g) => g.id === selectedId) ?? null,
    [grievances, selectedId]
  );

  const visible = useMemo(() => {
    return grievances.filter((g) => {
      if (filter === "all") return true;
      if (filter === "mine") {
        return g.raised_by === profileId || g.assigned_to === profileId;
      }
      return OPEN_GRIEVANCE_STATUSES.includes(g.status as GrievanceStatus);
    });
  }, [grievances, filter, profileId]);

  function refresh(msg: string) {
    setMessage(msg);
    setError(null);
    router.refresh();
  }

  function resetRaise() {
    setTitle("");
    setDescription("");
    setCategory("operations");
    setPriority("medium");
    setAssignOnRaise("");
    setRaiseFiles([]);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Settings"
        title="Grievances"
        subtitle="Internal company issues ΓÇö not customer service tickets"
        className="mb-0"
        actions={
          canRaise ? (
            <Button type="button" size="sm" onClick={() => setRaiseOpen(true)}>
              Raise grievance
            </Button>
          ) : null
        }
      />

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {message && <p className="text-sm text-[var(--success)]">{message}</p>}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["open", "Open"],
            ["mine", "My items"],
            ["all", "All"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              filter === key
                ? "bg-[var(--primary)] text-white"
                : "bg-white text-[var(--text-body)] border border-[var(--border)] hover:bg-[var(--bg)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-center text-sm text-[var(--text-muted)]">
          No grievances in this view
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((g) => {
            const statusLabel =
              GRIEVANCE_STATUS_LABELS[g.status as GrievanceStatus] ?? g.status;
            const catLabel =
              GRIEVANCE_CATEGORY_LABELS[g.category as GrievanceCategory] ??
              g.category;
            const priLabel =
              GRIEVANCE_PRIORITY_LABELS[g.priority as GrievancePriority] ??
              g.priority;

            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(g.id);
                    setAssignTo(g.assigned_to ?? "");
                    setResolveNotes("");
                    setEscalateNote("");
                    setMessage(null);
                    setError(null);
                  }}
                  className="w-full rounded-xl border border-[var(--border)] bg-white p-4 text-left transition hover:border-[var(--primary)]/40 hover:shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--text-dark)]">{g.title}</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        <span className={statusTone(g.status)}>{statusLabel}</span>
                        {" ┬╖ "}
                        {catLabel}
                        {" ┬╖ "}
                        {g.raiser?.name ?? "Staff"}
                        {g.assignee ? ` ΓåÆ ${g.assignee.name}` : ""}
                        {" ┬╖ "}
                        {formatDateTime(g.created_at)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${priorityTone(g.priority)}`}
                    >
                      {priLabel}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-[var(--text-body)]">
                    {g.description}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={selected?.title ?? "Grievance"}
        subtitle={
          selected
            ? `${GRIEVANCE_STATUS_LABELS[selected.status as GrievanceStatus] ?? selected.status} ┬╖ ${formatDateTime(selected.created_at)}`
            : undefined
        }
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <span
                className={`rounded-md px-2 py-0.5 font-medium ${priorityTone(selected.priority)}`}
              >
                {GRIEVANCE_PRIORITY_LABELS[selected.priority as GrievancePriority] ??
                  selected.priority}
              </span>
              <span className="rounded-md bg-[var(--bg)] px-2 py-0.5 text-[var(--text-muted)]">
                {GRIEVANCE_CATEGORY_LABELS[selected.category as GrievanceCategory] ??
                  selected.category}
              </span>
            </div>

            <p className="whitespace-pre-wrap text-sm text-[var(--text-body)]">
              {selected.description}
            </p>

            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Raised by</dt>
                <dd>{selected.raiser?.name ?? "ΓÇö"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--text-muted)]">Assignee</dt>
                <dd>{selected.assignee?.name ?? "Unassigned"}</dd>
              </div>
              {selected.escalated_at && (
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Escalated</dt>
                  <dd>{formatDateTime(selected.escalated_at)}</dd>
                </div>
              )}
              {selected.resolved_at && (
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Resolved</dt>
                  <dd>{formatDateTime(selected.resolved_at)}</dd>
                </div>
              )}
            </dl>

            {selected.resolution_notes && (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-sm">
                <p className="text-xs font-medium text-[var(--text-muted)]">Notes</p>
                <p className="mt-1 whitespace-pre-wrap">{selected.resolution_notes}</p>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">
                Attachments
              </p>
              {selected.attachments && selected.attachments.length > 0 ? (
                <ul className="flex flex-wrap gap-2">
                  {selected.attachments.map((a) => (
                    <li key={a.id}>
                      <a
                        href={a.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg border border-[var(--border)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.file_url}
                          alt={a.caption ?? "Attachment"}
                          className="h-20 w-20 object-cover"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No attachments</p>
              )}
              {selected.status !== "resolved" && (canRaise || canManage) && (
                <div className="mt-2">
                  <ProofUploadButton
                    folder="grievances"
                    entityId={selected.id}
                    label="Add attachment"
                    onUploaded={(url) =>
                      startTransition(async () => {
                        setError(null);
                        try {
                          await addGrievanceAttachment({
                            grievanceId: selected.id,
                            fileUrl: url,
                          });
                          refresh("Attachment added");
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Failed");
                        }
                      })
                    }
                  />
                </div>
              )}
            </div>

            {selected.status !== "resolved" && (
              <div className="space-y-3 border-t border-[var(--border)] pt-4">
                {(selected.status === "open" || selected.status === "escalated") &&
                  (canManage ||
                    selected.assigned_to === profileId ||
                    selected.raised_by === profileId) && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          setError(null);
                          try {
                            await startGrievance(selected.id);
                            refresh("Marked in progress");
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed");
                          }
                        })
                      }
                    >
                      Start work
                    </Button>
                  )}

                {canManage && (
                  <>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[12rem] flex-1">
                        <Label htmlFor="assign-to">Assignee</Label>
                        <Select
                          id="assign-to"
                          value={assignTo}
                          onChange={(e) => setAssignTo(e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            setError(null);
                            try {
                              await assignGrievance({
                                grievanceId: selected.id,
                                assignedTo: assignTo || null,
                              });
                              refresh("Assignee updated");
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : "Failed"
                              );
                            }
                          })
                        }
                      >
                        Save assignee
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="escalate-note">Escalate (managers)</Label>
                      <Input
                        id="escalate-note"
                        value={escalateNote}
                        onChange={(e) => setEscalateNote(e.target.value)}
                        placeholder="Optional escalation note"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={pending || selected.status === "escalated"}
                        onClick={() =>
                          startTransition(async () => {
                            setError(null);
                            try {
                              await escalateGrievance({
                                grievanceId: selected.id,
                                assignedTo: assignTo || null,
                                note: escalateNote || undefined,
                              });
                              setEscalateNote("");
                              refresh("Escalated");
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : "Failed"
                              );
                            }
                          })
                        }
                      >
                        Escalate
                      </Button>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="resolve-notes">Resolve</Label>
                      <Textarea
                        id="resolve-notes"
                        rows={3}
                        value={resolveNotes}
                        onChange={(e) => setResolveNotes(e.target.value)}
                        placeholder="Resolution notes (required)"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={pending || resolveNotes.trim().length < 3}
                        onClick={() =>
                          startTransition(async () => {
                            setError(null);
                            try {
                              await resolveGrievance({
                                grievanceId: selected.id,
                                resolutionNotes: resolveNotes,
                              });
                              setResolveNotes("");
                              refresh("Resolved");
                              setSelectedId(null);
                            } catch (err) {
                              setError(
                                err instanceof Error ? err.message : "Failed"
                              );
                            }
                          })
                        }
                      >
                        Mark resolved
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={raiseOpen}
        onClose={() => {
          setRaiseOpen(false);
          resetRaise();
        }}
        title="Raise grievance"
        subtitle="Internal company issue for managers to track"
        size="lg"
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            startTransition(async () => {
              setError(null);
              try {
                await raiseGrievance({
                  title,
                  description,
                  category,
                  priority,
                  assignedTo: assignOnRaise || null,
                  attachmentUrls: raiseFiles,
                });
                resetRaise();
                setRaiseOpen(false);
                refresh("Grievance raised");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed");
              }
            });
          }}
        >
          <div>
            <Label htmlFor="g-title">Title</Label>
            <Input
              id="g-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary"
            />
          </div>
          <div>
            <Label htmlFor="g-desc">Description</Label>
            <Textarea
              id="g-desc"
              required
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened, who is affected, what you need"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="g-cat">Category</Label>
              <Select
                id="g-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as GrievanceCategory)}
              >
                {GRIEVANCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {GRIEVANCE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="g-pri">Priority</Label>
              <Select
                id="g-pri"
                value={priority}
                onChange={(e) => setPriority(e.target.value as GrievancePriority)}
              >
                {GRIEVANCE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {GRIEVANCE_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="g-assign">Assignee (optional)</Label>
            <Select
              id="g-assign"
              value={assignOnRaise}
              onChange={(e) => setAssignOnRaise(e.target.value)}
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Attachments (optional)</Label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <ProofUploadButton
                folder="grievances"
                entityId={raiseDraftId}
                label="Upload file"
                onUploaded={(url) => setRaiseFiles((prev) => [...prev, url])}
              />
              {raiseFiles.length > 0 && (
                <span className="text-xs text-[var(--text-muted)]">
                  {raiseFiles.length} file(s)
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setRaiseOpen(false);
                resetRaise();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "SavingΓÇª" : "Submit"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
