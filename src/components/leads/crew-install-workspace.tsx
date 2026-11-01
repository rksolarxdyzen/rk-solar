"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Images } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProofUploadField } from "@/components/ui/proof-upload-button";
import { InverterSerialCapture } from "@/components/installation/inverter-serial-capture";
import { PanelCaptureStep } from "@/components/installation/panel-capture-step";
import {
  addInstallationPhoto,
  deleteInstallationPhoto,
  listInstallationPhotos,
} from "@/actions/installation";
import { uploadProofFile } from "@/actions/uploads";
import {
  expectedInstallPanelCount,
  hasGeoTag,
  installationCrewGate,
  type InstallationPhoto,
} from "@/lib/domain/installation";
import type { LeadWithRelations } from "@/lib/domain/types";
import { captureGeoPosition } from "@/lib/geo/capture-position";
import { formatDateTime } from "@/lib/utils";
import { friendlyUploadError } from "@/lib/uploads/proof-mime";
import { prepareProofFileForUpload } from "@/lib/uploads/prepare-proof-file";

const INVERTER_GPS_BATCH_MAX = 12;

async function uploadPanelProofFile(file: File, leadId: string) {
  const prepared = await prepareProofFileForUpload(file, { kind: "photo" });
  const fd = new FormData();
  fd.set("file", prepared);
  fd.set("folder", "installation");
  fd.set("entityId", leadId);
  fd.set("proofKind", "photo");
  const result = await uploadProofFile(fd);
  if (!result.ok) throw new Error(result.error);
  return result.publicUrl;
}

function PhotoRow({
  photo,
  canRemove,
  onRemove,
}: {
  photo: InstallationPhoto;
  canRemove: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--border-light)] bg-white px-3 py-2 text-sm">
      <div>
        {photo.panel_index != null && <p className="font-medium">Panel {photo.panel_index}</p>}
        <p className="text-xs text-[var(--text-muted)]">
          {formatDateTime(photo.created_at)}
          {photo.serial_hint ? ` · ${photo.serial_hint}` : ""}
          {hasGeoTag(photo) ? ` · ${photo.latitude}, ${photo.longitude}` : ""}
        </p>
        <a
          href={photo.file_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-semibold text-[var(--primary)]"
        >
          Open
        </a>
      </div>
      {canRemove && (
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          Remove
        </Button>
      )}
    </li>
  );
}

export function CrewInstallWorkspace({
  lead,
  canUpload,
  onDone,
  jobOpen,
  canRemoveProofs = false,
}: {
  lead: Pick<
    LeadWithRelations,
    | "id"
    | "company_id"
    | "expected_panel_count"
    | "won_panel_quantity"
    | "sales_stage"
    | "installation_completed_at"
    | "inverter_serial_number"
    | "install_geo_lat"
    | "install_geo_lng"
  >;
  canUpload: boolean;
  onDone: () => void;
  jobOpen?: boolean;
  canRemoveProofs?: boolean;
}) {
  const batchInputRef = useRef<HTMLInputElement>(null);
  const inverterBatchInputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<InstallationPhoto[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(
    null
  );
  const [inverterBatchProgress, setInverterBatchProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  const needed = expectedInstallPanelCount(lead);
  const handedOff =
    jobOpen === undefined
      ? lead.sales_stage !== "installation_assigned" &&
        lead.sales_stage !== "installation_in_progress"
      : !jobOpen;
  const canEdit = canUpload && !handedOff && !lead.installation_completed_at;
  const showRemove =
    canRemoveProofs && canEdit && !pending && !batchProgress && !inverterBatchProgress;

  const gate = installationCrewGate({
    photos,
    expectedPanelCount: needed,
    inverterSerialNumber: lead.inverter_serial_number,
    leadHasGeo: Boolean(lead.install_geo_lat && lead.install_geo_lng),
  });

  async function reload() {
    setPhotos(await listInstallationPhotos(lead.id));
  }

  useEffect(() => {
    void reload().catch(() => setPhotos([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  async function saveProof(
    kind: "site" | "completion_video" | "other" | "panel_image" | "inverter_serial",
    fileUrl: string,
    extra?: {
      panelIndex?: number;
      serial?: string;
      latitude?: number | null;
      longitude?: number | null;
    }
  ) {
    setError(null);
    setOkMsg(null);
    const result = await addInstallationPhoto({
      leadId: lead.id,
      photoKind: kind,
      fileUrl,
      caption: null,
      panelIndex: extra?.panelIndex ?? null,
      serialHint: extra?.serial || null,
      latitude: extra?.latitude ?? null,
      longitude: extra?.longitude ?? null,
    });
    await reload();
    if (result.completed) {
      setOkMsg("All required photos are in — you are done.");
    } else {
      setOkMsg("Saved. Remaining work stays on this job.");
    }
    onDone();
  }

  async function uploadPanelBatch(files: File[]) {
    const remaining = needed - gate.panelImageCount;
    if (remaining <= 0) {
      setError("All panel photos are already on this job.");
      return;
    }
    const selected = files.slice(0, remaining);
    if (selected.length === 0) return;

    setError(null);
    setOkMsg(
      files.length > remaining
        ? `Using the first ${selected.length} photo${selected.length === 1 ? "" : "s"} (next panels in order). Extra files ignored.`
        : null
    );
    setBatchProgress({ done: 0, total: selected.length });

    let lastCompleted = false;
    try {
      for (let i = 0; i < selected.length; i++) {
        const panelIndex = gate.panelImageCount + 1 + i;
        const url = await uploadPanelProofFile(selected[i], lead.id);
        const result = await addInstallationPhoto({
          leadId: lead.id,
          photoKind: "panel_image",
          fileUrl: url,
          caption: null,
          panelIndex,
          serialHint: null,
        });
        lastCompleted = Boolean(result.completed);
        setBatchProgress({ done: i + 1, total: selected.length });
      }
      await reload();
      setOkMsg(
        lastCompleted
          ? "All required photos are in — you are done."
          : `Saved ${selected.length} panel photo${selected.length === 1 ? "" : "s"} in order.`
      );
      onDone();
    } catch (err) {
      await reload().catch(() => undefined);
      setError(friendlyUploadError(err));
    } finally {
      setBatchProgress(null);
    }
  }

  async function uploadInverterGpsBatch(files: File[]) {
    const selected = files.slice(0, INVERTER_GPS_BATCH_MAX);
    if (selected.length === 0) return;

    setError(null);
    setOkMsg(
      files.length > INVERTER_GPS_BATCH_MAX
        ? `Using the first ${INVERTER_GPS_BATCH_MAX} photos. Extra files ignored.`
        : null
    );
    setInverterBatchProgress({ done: 0, total: selected.length });

    let lastCompleted = false;
    try {
      const geo = await captureGeoPosition();
      for (let i = 0; i < selected.length; i++) {
        const url = await uploadPanelProofFile(selected[i], lead.id);
        const result = await addInstallationPhoto({
          leadId: lead.id,
          photoKind: "inverter_serial",
          fileUrl: url,
          caption: null,
          panelIndex: null,
          serialHint: null,
          latitude: geo.latitude,
          longitude: geo.longitude,
        });
        lastCompleted = Boolean(result.completed);
        setInverterBatchProgress({ done: i + 1, total: selected.length });
      }
      await reload();
      setOkMsg(
        lastCompleted
          ? "All required photos are in — you are done."
          : `Saved ${selected.length} inverter GPS photo${selected.length === 1 ? "" : "s"}.`
      );
      onDone();
    } catch (err) {
      await reload().catch(() => undefined);
      setError(friendlyUploadError(err));
    } finally {
      setInverterBatchProgress(null);
    }
  }

  const customerPhotos = photos.filter((p) => p.photo_kind === "site");
  const inverterPhotos = photos.filter((p) => p.photo_kind === "inverter_serial");
  const remainingPanels = Math.max(0, needed - gate.panelImageCount);
  const batchPct =
    batchProgress && batchProgress.total > 0
      ? Math.round((batchProgress.done / batchProgress.total) * 100)
      : 0;
  const inverterBatchPct =
    inverterBatchProgress && inverterBatchProgress.total > 0
      ? Math.round((inverterBatchProgress.done / inverterBatchProgress.total) * 100)
      : 0;
  const others = photos.filter((p) => p.photo_kind === "other");
  const uploadBusy = pending || Boolean(batchProgress) || Boolean(inverterBatchProgress);

  if (handedOff) {
    return (
      <p className="rounded-lg bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text-muted)]">
        All required photos are in — you are done.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        Required: customer photo, inverter serial, {needed} panel photo{needed === 1 ? "" : "s"}.
        Other photos are optional. Finish remaining items anytime — saved files stay.
      </p>
      {!gate.ok && (
        <p className="text-xs text-[var(--text-muted)]">Still needed: {gate.missing.join("; ")}</p>
      )}

      <section className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-dark)]">
          1. Customer photo with GPS
        </h3>
        {customerPhotos.length > 0 ? (
          <ul className="space-y-2">
            {customerPhotos.map((photo) => (
              <PhotoRow
                key={photo.id}
                photo={photo}
                canRemove={showRemove}
                onRemove={() =>
                  startTransition(async () => {
                    try {
                      await deleteInstallationPhoto(photo.id);
                      await reload();
                    } catch (err) {
                      setError(friendlyUploadError(err));
                    }
                  })
                }
              />
            ))}
          </ul>
        ) : (
          canEdit && (
            <ProofUploadField
              folder="installation"
              entityId={lead.id}
              companyId={lead.company_id}
              disabled={uploadBusy}
              kind="photo"
              requireGeo
              label="Take or upload customer photo"
              hint="Camera or gallery · JPG / PNG / WebP · GPS must be on"
              onUploaded={async (url, geo) => {
                if (!geo) {
                  throw new Error(
                    "Location is required for the customer photo. Enable GPS and try again."
                  );
                }
                await saveProof("site", url, {
                  latitude: geo.latitude,
                  longitude: geo.longitude,
                });
              }}
            />
          )
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-dark)]">2. Inverter serial</h3>
          {canEdit && (
            <div className="shrink-0">
              <input
                ref={inverterBatchInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                multiple
                className="hidden"
                disabled={uploadBusy}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length === 0) return;
                  void uploadInverterGpsBatch(files);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={uploadBusy}
                onClick={() => inverterBatchInputRef.current?.click()}
              >
                <Images className="h-4 w-4" />
                Add several GPS photos
              </Button>
            </div>
          )}
        </div>
        {lead.inverter_serial_number ? (
          <p className="text-sm">Saved: {lead.inverter_serial_number}</p>
        ) : null}
        {canEdit && (
          <InverterSerialCapture
            leadId={lead.id}
            initialSerial={lead.inverter_serial_number}
            disabled={uploadBusy}
            onSaved={() => {
              setOkMsg("Inverter serial saved");
              onDone();
            }}
          />
        )}
        <div className="space-y-2 border-t border-[var(--border-light)] pt-3">
          <p className="text-xs font-medium text-[var(--text-dark)]">
            Inverter photos with GPS ({inverterPhotos.length})
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Optional. Camera or gallery — location is captured when you add photos (up to{" "}
            {INVERTER_GPS_BATCH_MAX} at once).
          </p>
          {inverterBatchProgress && (
            <div className="rounded-lg border border-[var(--info)]/30 bg-[var(--bg)] px-3 py-2">
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-[var(--text-dark)]">
                <span>Uploading inverter GPS photos…</span>
                <span className="tabular-nums">
                  {inverterBatchProgress.done}/{inverterBatchProgress.total}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-[var(--info)] transition-[width] duration-300"
                  style={{ width: `${inverterBatchPct}%` }}
                />
              </div>
            </div>
          )}
          {inverterPhotos.length > 0 && (
            <ul className="space-y-2">
              {inverterPhotos.map((photo) => (
                <PhotoRow
                  key={photo.id}
                  photo={photo}
                  canRemove={showRemove}
                  onRemove={() =>
                    startTransition(async () => {
                      try {
                        await deleteInstallationPhoto(photo.id);
                        await reload();
                      } catch (err) {
                        setError(friendlyUploadError(err));
                      }
                    })
                  }
                />
              ))}
            </ul>
          )}
          {canEdit && (
            <ProofUploadField
              folder="installation"
              entityId={lead.id}
              companyId={lead.company_id}
              disabled={uploadBusy}
              kind="photo"
              requireGeo
              capture="environment"
              label="Take / upload GPS photo"
              hint="Camera or gallery · JPG / PNG / WebP · GPS must be on"
              onUploaded={async (url, geo) => {
                if (!geo) {
                  throw new Error(
                    "Location is required for inverter photos. Enable GPS and try again."
                  );
                }
                await saveProof("inverter_serial", url, {
                  latitude: geo.latitude,
                  longitude: geo.longitude,
                });
              }}
            />
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-dark)]">
            3. Panel photos ({gate.panelImageCount}/{needed})
          </h3>
          {canEdit && remainingPanels > 0 && (
            <div className="shrink-0">
              <input
                ref={batchInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                multiple
                className="hidden"
                disabled={uploadBusy}
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  if (files.length === 0) return;
                  void uploadPanelBatch(files);
                }}
              />
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={uploadBusy}
                onClick={() => batchInputRef.current?.click()}
              >
                <Images className="h-4 w-4" />
                Add several panel photos
              </Button>
            </div>
          )}
        </div>
        {canEdit && remainingPanels > 0 && (
          <p className="text-xs text-[var(--text-muted)]">
            Pick up to {remainingPanels} photo{remainingPanels === 1 ? "" : "s"} at once. They fill
            the next panel{remainingPanels === 1 ? "" : "s"} in order (Panel{" "}
            {gate.panelImageCount + 1}
            {remainingPanels > 1 ? `–${needed}` : ""}). One-by-one capture with barcode is still
            available below.
          </p>
        )}
        {batchProgress && (
          <div className="rounded-lg border border-[var(--info)]/30 bg-[var(--bg)] px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-[var(--text-dark)]">
              <span>Uploading panel photos…</span>
              <span className="tabular-nums">
                {batchProgress.done}/{batchProgress.total}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-[var(--info)] transition-[width] duration-300"
                style={{ width: `${batchPct}%` }}
              />
            </div>
          </div>
        )}
        {photos
          .filter((p) => p.photo_kind === "panel_image")
          .sort((a, b) => (a.panel_index ?? 0) - (b.panel_index ?? 0))
          .map((photo) => (
            <PhotoRow
              key={photo.id}
              photo={photo}
              canRemove={showRemove}
              onRemove={() =>
                startTransition(async () => {
                  try {
                    await deleteInstallationPhoto(photo.id);
                    await reload();
                  } catch (err) {
                    setError(friendlyUploadError(err));
                  }
                })
              }
            />
          ))}
        {canEdit && gate.panelImageCount < needed && (
          <PanelCaptureStep
            leadId={lead.id}
            companyId={lead.company_id}
            panelIndex={gate.panelImageCount + 1}
            enabled
            alreadyUploaded={false}
            disabled={uploadBusy}
            onUploaded={async (url, serial) =>
              saveProof("panel_image", url, {
                panelIndex: gate.panelImageCount + 1,
                serial,
              })
            }
          />
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-dark)]">Other (optional)</h3>
        <p className="text-xs text-[var(--text-muted)]">Extra photos or files. Not required.</p>
        {others.length > 0 && (
          <ul className="space-y-2">
            {others.map((photo) => (
              <PhotoRow
                key={photo.id}
                photo={photo}
                canRemove={showRemove}
                onRemove={() =>
                  startTransition(async () => {
                    try {
                      await deleteInstallationPhoto(photo.id);
                      await reload();
                    } catch (err) {
                      setError(friendlyUploadError(err));
                    }
                  })
                }
              />
            ))}
          </ul>
        )}
        {canEdit && (
          <ProofUploadField
            folder="installation"
            entityId={lead.id}
            companyId={lead.company_id}
            disabled={uploadBusy}
            kind="photo"
            capture="environment"
            label="Add other photo"
            onUploaded={async (url) => saveProof("other", url)}
          />
        )}
      </section>

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {okMsg && <p className="text-sm text-[var(--success)]">{okMsg}</p>}
    </div>
  );
}
