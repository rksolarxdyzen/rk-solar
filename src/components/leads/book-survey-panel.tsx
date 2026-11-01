"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { bookSurvey, getSurveyorOptions } from "@/actions/leads";
import { cn } from "@/lib/utils";
import type { LeadWithRelations } from "@/lib/domain/types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultSurveySlot() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return { date: toDateInputValue(d), time: "10:00" };
}

export type BookSurveyLead = {
  id: string;
  name: string;
  assigned_surveyor_id?: string | null;
  survey_date?: string | null;
  visit_scheduled_at?: string | null;
  visit_notes?: string | null;
};

export function BookSurveyModal({
  lead,
  open,
  onClose,
  onDone,
  mode = "book",
}: {
  lead: BookSurveyLead | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  mode?: "book" | "reschedule";
}) {
  const defaults = useMemo(() => defaultSurveySlot(), []);
  const [surveyDate, setSurveyDate] = useState(defaults.date);
  const [surveyTime, setSurveyTime] = useState(defaults.time);
  const [surveyorId, setSurveyorId] = useState("");
  const [surveyors, setSurveyors] = useState<Array<{ id: string; name: string }>>([]);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isReschedule = mode === "reschedule";
  const useCheckboxes = surveyors.length > 0 && surveyors.length <= 4;

  useEffect(() => {
    getSurveyorOptions()
      .then(setSurveyors)
      .catch(() => setSurveyors([]));
  }, []);

  useEffect(() => {
    if (!open || !lead) return;
    const slot = defaultSurveySlot();
    setSurveyDate(lead.survey_date ?? slot.date);
    if (lead.visit_scheduled_at) {
      const t = new Date(lead.visit_scheduled_at);
      setSurveyTime(`${pad(t.getHours())}:${pad(t.getMinutes())}`);
    } else {
      setSurveyTime(slot.time);
    }
    setSurveyorId(lead.assigned_surveyor_id ?? "");
    setNotes(lead.visit_notes ?? "");
    setError(null);
  }, [open, lead]);

  function submit() {
    if (!lead) return;
    setError(null);
    if (!surveyorId) {
      setError("Select a field surveyor");
      return;
    }
    startTransition(async () => {
      try {
        await bookSurvey({
          leadId: lead.id,
          surveyDate,
          surveyTime,
          surveyorId,
          notes: notes.trim() || undefined,
        });
        onClose();
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to schedule visit");
      }
    });
  }

  return (
    <Modal
      open={open && Boolean(lead)}
      onClose={onClose}
      title={isReschedule ? "Reschedule visit" : "Schedule site visit"}
      subtitle={lead?.name}
      layer="nested"
    >
      <div className="space-y-3">
        <div>
          <Label>Field surveyor</Label>
          {useCheckboxes ? (
            <div className="mt-1 space-y-1.5">
              {surveyors.map((s) => (
                <label
                  key={s.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                    surveyorId === s.id
                      ? "border-[var(--primary)] bg-[var(--primary-faint)]"
                      : "border-[var(--border)] bg-white"
                  )}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--primary)]"
                    checked={surveyorId === s.id}
                    onChange={() => setSurveyorId(surveyorId === s.id ? "" : s.id)}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          ) : (
            <Select value={surveyorId} onChange={(e) => setSurveyorId(e.target.value)}>
              <option value="">Select surveyor</option>
              {surveyors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Date</Label>
            <Input
              type="date"
              value={surveyDate}
              onChange={(e) => setSurveyDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Time</Label>
            <Input
              type="time"
              value={surveyTime}
              onChange={(e) => setSurveyTime(e.target.value)}
            />
          </div>
        </div>
        <div>
          <Label>Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Access instructions, contact on site…"
            rows={3}
          />
        </div>
        {error && <p className="text-sm text-[var(--error)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? "Saving…" : isReschedule ? "Update" : "Confirm"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function BookSurveyPanel({
  lead,
  onDone,
  mode = "book",
  variant = "card",
}: {
  lead: LeadWithRelations;
  onDone: () => void;
  mode?: "book" | "reschedule";
  variant?: "card" | "header";
}) {
  const [open, setOpen] = useState(false);
  const isReschedule = mode === "reschedule";

  return (
    <>
      {variant === "header" ? (
        <Button type="button" size="sm" variant={isReschedule ? "secondary" : "primary"} onClick={() => setOpen(true)}>
          {isReschedule ? "Reschedule visit" : "Schedule visit"}
        </Button>
      ) : isReschedule ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-white px-4 py-3">
          <p className="text-sm text-[var(--text-body)]">
            Reschedule updates the surveyor assignment and visit reminder.
          </p>
          <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
            Reschedule visit
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-xl border border-[var(--accent)] bg-[var(--accent-faint)] p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-light)]">
              <CalendarCheck className="h-4 w-4 text-[var(--accent-hover)]" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--text-dark)]">Schedule site visit</h3>
              <p className="mt-0.5 text-sm text-[var(--text-body)]">
                Assign a field surveyor and set date/time. Tele-callers cannot conduct the survey.
              </p>
            </div>
          </div>
          <Button className="w-full sm:w-auto" onClick={() => setOpen(true)}>
            Schedule visit
          </Button>
        </div>
      )}

      <BookSurveyModal
        lead={lead}
        open={open}
        onClose={() => setOpen(false)}
        onDone={onDone}
        mode={mode}
      />
    </>
  );
}
