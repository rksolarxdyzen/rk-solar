"use client";

import { SURVEY_PHOTO_SLOTS } from "@/lib/domain/survey-photos";
import type { CrewJobBrief } from "@/lib/domain/installation";

function dash(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return String(value);
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-0.5 text-sm text-[var(--text-dark)]">{value}</p>
    </div>
  );
}

export function CrewJobBriefCards({ brief }: { brief: CrewJobBrief }) {
  const survey = brief.survey;
  const subsidy =
    brief.won.companyBearsSubsidy == null
      ? "—"
      : brief.won.companyBearsSubsidy
        ? "Company bears / recovers subsidy"
        : "Customer bears subsidy";

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/40 p-4">
        <h3 className="text-sm font-semibold text-[var(--text-dark)]">Site survey</h3>
        {brief.surveyLoadError && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">{brief.surveyLoadError}</p>
        )}
        {!brief.surveyLoadError && !survey && (
          <p className="mt-2 text-sm text-[var(--text-muted)]">Survey not on file.</p>
        )}
        {survey && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Latitude" value={dash(survey.latitude)} />
            <Field label="Longitude" value={dash(survey.longitude)} />
            <Field label="Total terrace (sq. ft.)" value={dash(survey.totalTerraceSqft)} />
            <Field label="Shadow-free area (sq. ft.)" value={dash(survey.shadowFreeSqft)} />
            <Field
              label="Proposed capacity (kW)"
              value={survey.capacityKw != null ? `${survey.capacityKw}` : "—"}
            />
            <Field
              label="Feasibility"
              value={
                survey.feasibilityPass == null
                  ? "—"
                  : survey.feasibilityPass
                    ? "Pass"
                    : "Fail"
              }
            />
            <div className="sm:col-span-2">
              <Field label="Notes" value={survey.notes?.trim() ? survey.notes : "—"} />
            </div>
          </div>
        )}
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-semibold text-[var(--info)]">
            Survey photos
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {SURVEY_PHOTO_SLOTS.map((slot) => {
              const url = brief.surveyPhotos[slot.key];
              return (
                <div key={slot.key} className="min-w-0">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {slot.title}
                  </p>
                  {url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="mt-1 block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={slot.title}
                        className="h-36 w-full rounded-lg border border-[var(--border)] object-cover"
                      />
                    </a>
                  ) : (
                    <p className="mt-1 rounded-lg border border-dashed border-[var(--border)] px-3 py-6 text-center text-xs text-[var(--text-muted)]">
                      Not captured
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      </section>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--bg)]/40 p-4">
        <h3 className="text-sm font-semibold text-[var(--text-dark)]">System (from Won)</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Panel / module brand & capacity" value={dash(brief.won.panelName)} />
          </div>
          <Field label="Panel quantity" value={dash(brief.won.panelQuantity)} />
          <Field
            label="System size (kW)"
            value={brief.won.systemSizeKw != null ? String(brief.won.systemSizeKw) : "—"}
          />
          <div className="sm:col-span-2">
            <Field label="Inverter brand" value={dash(brief.won.inverterCompany)} />
          </div>
          <Field label="Consumer number" value={dash(brief.won.consumerNumber)} />
          <Field label="Subsidy" value={subsidy} />
        </div>
      </section>
    </div>
  );
}
