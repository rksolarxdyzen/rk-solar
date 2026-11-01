"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { MapPin, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ProofUploadField } from "@/components/ui/proof-upload-button";
import { completeSurvey, getSurveySitePhotos, startSurvey } from "@/actions/surveys";
import type { LeadWithRelations } from "@/lib/domain/types";
import {
  SURVEY_PHOTO_SLOTS,
  type SurveyPhotoKey,
} from "@/lib/domain/survey-photos";
import { TEMPERATURE_LABELS, TEMPERATURES, type LeadTemperature } from "@/lib/domain/workflow";
import { cn } from "@/lib/utils";

const EMPTY_PHOTOS: Record<SurveyPhotoKey, string> = {
  gps: "",
  roof: "",
  shadow: "",
  access: "",
};

export function SurveyCompletePanel({
  lead,
  onDone,
  canConductSurvey,
  variant = "card",
}: {
  lead: LeadWithRelations;
  onDone: () => void;
  canConductSurvey: boolean;
  variant?: "card" | "header";
}) {
  const survey = lead.survey;
  const isCompleted = lead.sales_stage === "survey_completed" && Boolean(survey?.completed_at);
  // Header: anyone viewing the lead. Card: keep canConductSurvey for edit affordance.
  const stageAllowsForm =
    lead.sales_stage === "new_lead" ||
    lead.sales_stage === "contacted" ||
    lead.sales_stage === "visit_scheduled" ||
    lead.sales_stage === "survey_in_progress" ||
    lead.sales_stage === "survey_completed";
  const canOpenForm =
    stageAllowsForm && (variant === "header" || canConductSurvey);

  const [open, setOpen] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [terrace, setTerrace] = useState("");
  const [shadowFree, setShadowFree] = useState("");
  const [capacity, setCapacity] = useState("");
  const [feasibilityPass, setFeasibilityPass] = useState(true);
  const [temperature, setTemperature] = useState<LeadTemperature>(lead.temperature ?? "warm");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<Record<SurveyPhotoKey, string>>(EMPTY_PHOTOS);
  const [geoPending, setGeoPending] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!survey) return;
    setLatitude(survey.latitude != null ? String(survey.latitude) : "");
    setLongitude(survey.longitude != null ? String(survey.longitude) : "");
    setTerrace(survey.total_terrace_sqft != null ? String(survey.total_terrace_sqft) : "");
    setShadowFree(survey.shadow_free_sqft != null ? String(survey.shadow_free_sqft) : "");
    setCapacity(survey.capacity_kw != null ? String(survey.capacity_kw) : "");
    setFeasibilityPass(survey.feasibility_pass ?? true);
    setNotes(survey.notes ?? "");
  }, [survey]);

  useEffect(() => {
    setTemperature(lead.temperature ?? "warm");
  }, [lead.temperature]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getSurveySitePhotos(lead.id)
      .then((existing) => {
        if (cancelled) return;
        setPhotos({
          gps: existing.gps ?? "",
          roof: existing.roof ?? "",
          shadow: existing.shadow ?? "",
          access: existing.access ?? "",
        });
      })
      .catch(() => {
        /* keep blank slots */
      });
    return () => {
      cancelled = true;
    };
  }, [open, lead.id]);

  function captureGeo() {
    if (!navigator.geolocation) {
      setError("Geolocation is not available on this device");
      return;
    }
    setGeoPending(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(7));
        setLongitude(pos.coords.longitude.toFixed(7));
        setGeoPending(false);
      },
      () => {
        setError("Could not read location — enter lat/long manually");
        setGeoPending(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function openForm() {
    setError(null);
    setOpen(true);
    if (
      lead.sales_stage === "new_lead" ||
      lead.sales_stage === "contacted" ||
      lead.sales_stage === "visit_scheduled"
    ) {
      startTransition(async () => {
        try {
          await startSurvey(lead.id);
        } catch {
          /* form can still be filled; completeSurvey will advance */
        }
      });
    }
  }

  function submit() {
    setError(null);
    const lat = Number(latitude);
    const lng = Number(longitude);
    const terraceN = Number(terrace);
    const shadowN = Number(shadowFree);
    const capN = Number(capacity);

    if (![lat, lng, terraceN, shadowN, capN].every((n) => Number.isFinite(n))) {
      setError("Enter valid numbers for location, areas, and capacity");
      return;
    }

    startTransition(async () => {
      try {
        await completeSurvey({
          leadId: lead.id,
          latitude: lat,
          longitude: lng,
          totalTerraceSqft: terraceN,
          shadowFreeSqft: shadowN,
          capacityKw: capN,
          feasibilityPass,
          temperature,
          notes: notes.trim() || undefined,
          photos: {
            gps: photos.gps || undefined,
            roof: photos.roof || undefined,
            shadow: photos.shadow || undefined,
            access: photos.access || undefined,
          },
        });
        setOpen(false);
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save survey");
      }
    });
  }

  if (isCompleted && !canConductSurvey && variant !== "header") {
    return (
      <div className="rounded-xl border border-[var(--success)]/30 bg-[var(--success-light)] p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-[var(--success)]" />
          <div className="text-sm">
            <p className="font-semibold text-[var(--text-dark)]">Survey completed</p>
            <p className="mt-1 text-[var(--text-body)]">
              {survey?.capacity_kw != null ? `${survey.capacity_kw} kW` : "Capacity n/a"} · Terrace{" "}
              {survey?.total_terrace_sqft ?? "—"} sq.ft · Shadow-free{" "}
              {survey?.shadow_free_sqft ?? "—"} sq.ft · Feasibility{" "}
              {survey?.feasibility_pass ? "Pass" : "Fail"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!canOpenForm && !isCompleted) return null;

  const triggerLabel = isCompleted ? "Edit survey" : "Open digital form";

  return (
    <>
      {variant === "header" ? (
        <Button type="button" size="sm" variant="secondary" onClick={openForm}>
          {triggerLabel}
        </Button>
      ) : (
        <div
          className={cn(
            "space-y-3 rounded-xl border p-4",
            isCompleted
              ? "border-[var(--success)]/40 bg-[var(--success-light)]"
              : "border-[var(--info)]/40 bg-[var(--info-light)]"
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/80">
              <MapPin className="h-4 w-4 text-[var(--info)]" />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--text-dark)]">
                {isCompleted ? "Survey completed" : "Digital site survey"}
              </h3>
              <p className="mt-0.5 text-sm text-[var(--text-body)]">
                Capture geo, optional site photos (incl. GPS), terrace / shadow-free area,
                capacity (kW), feasibility, and lead temperature.
              </p>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isCompleted ? "Edit survey" : "Complete digital survey"}
        subtitle={lead.name}
        layer="nested"
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <Label>Latitude</Label>
              <Input
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="23.0225"
                inputMode="decimal"
              />
            </div>
            <div className="min-w-0 flex-1">
              <Label>Longitude</Label>
              <Input
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="72.5714"
                inputMode="decimal"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              disabled={geoPending}
              onClick={captureGeo}
            >
              {geoPending ? "Locating…" : "Use GPS"}
            </Button>
          </div>

          <fieldset className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3">
            <legend className="px-1 text-[0.69rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Site photos (optional)
            </legend>
            <p className="text-xs text-[var(--text-muted)]">
              Add any of these photos — they will appear on the lead Docs tab.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {SURVEY_PHOTO_SLOTS.map((slot) => {
                const url = photos[slot.key];
                return (
                  <div
                    key={slot.key}
                    className="space-y-2 rounded-lg border border-[var(--border-light)] bg-white p-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-dark)]">
                        {slot.title}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">{slot.hint}</p>
                    </div>
                    {url ? (
                      <div className="space-y-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={slot.title}
                          className="h-28 w-full rounded-lg border border-[var(--border-light)] object-cover"
                        />
                        <div className="flex flex-wrap gap-2">
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-semibold text-[var(--primary)]"
                          >
                            Open
                          </a>
                          <button
                            type="button"
                            className="text-xs font-semibold text-[var(--error)]"
                            onClick={() =>
                              setPhotos((prev) => ({ ...prev, [slot.key]: "" }))
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <ProofUploadField
                        folder="survey"
                        entityId={lead.id}
                        accept="image/*"
                        capture={slot.key === "gps" ? "environment" : undefined}
                        hint="JPG, PNG, or WebP · max 10MB"
                        label={slot.key === "gps" ? "Take / upload GPS photo" : "Upload photo"}
                        onUploaded={(publicUrl) =>
                          setPhotos((prev) => ({ ...prev, [slot.key]: publicUrl }))
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Total terrace area (sq. ft.)</Label>
              <Input
                value={terrace}
                onChange={(e) => setTerrace(e.target.value)}
                inputMode="decimal"
                placeholder="1200"
              />
            </div>
            <div>
              <Label>Shadow-free area (sq. ft.)</Label>
              <Input
                value={shadowFree}
                onChange={(e) => setShadowFree(e.target.value)}
                inputMode="decimal"
                placeholder="900"
              />
            </div>
          </div>

          <div>
            <Label>Customer capacity requirement (kW)</Label>
            <Input
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              inputMode="decimal"
              placeholder="5"
            />
          </div>

          <fieldset>
            <legend className="mb-1.5 block text-[0.69rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Feasibility — shadow-free area enough for requested size?
            </legend>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={feasibilityPass ? "primary" : "secondary"}
                onClick={() => setFeasibilityPass(true)}
              >
                Pass
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!feasibilityPass ? "danger" : "secondary"}
                onClick={() => setFeasibilityPass(false)}
              >
                Fail
              </Button>
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 block text-[0.69rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Lead temperature
            </legend>
            <p className="mb-2 text-xs text-[var(--text-muted)]">
              After meeting the customer, mark how likely they are to close.
            </p>
            <div className="flex flex-wrap gap-2">
              {TEMPERATURES.map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={temperature === t ? "primary" : "secondary"}
                  onClick={() => setTemperature(t)}
                >
                  {TEMPERATURE_LABELS[t]}
                </Button>
              ))}
            </div>
          </fieldset>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Roof type, access, obstacles…"
            />
          </div>

          {error && <p className="text-sm text-[var(--error)]">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={pending} onClick={submit}>
              {pending ? "Saving…" : "Complete survey"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function QuotePlaceholderCard({
  lead,
  canCreate = false,
  variant = "card",
}: {
  lead: LeadWithRelations;
  canCreate?: boolean;
  variant?: "card" | "header";
}) {
  if (
    lead.sales_stage !== "survey_completed" &&
    lead.sales_stage !== "quoted" &&
    lead.sales_stage !== "quote_accepted"
  ) {
    return null;
  }

  if (variant === "header") {
    if (!canCreate) return null;
    return (
      <Link href={`/quotations/new?leadId=${lead.id}&kind=solar`}>
        <Button type="button" size="sm" variant="secondary">
          Create quotation
        </Button>
      </Link>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--primary-light)]">
          <FileText className="h-4 w-4 text-[var(--primary)]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-[var(--text-dark)]">Create quotation</h3>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Build a solar, premium, or general quotation for this lead.
          </p>
          {canCreate ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={`/quotations/new?leadId=${lead.id}&kind=solar`}>
                <Button type="button" size="sm">
                  Solar quote
                </Button>
              </Link>
              <Link href={`/quotations/new?leadId=${lead.id}&kind=premium`}>
                <Button type="button" size="sm" variant="secondary">
                  Premium quote
                </Button>
              </Link>
              <Link href={`/quotations/new?leadId=${lead.id}&kind=non_solar`}>
                <Button type="button" size="sm" variant="secondary">
                  Non-solar quote
                </Button>
              </Link>
            </div>
          ) : (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              You need quotation create permission.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
