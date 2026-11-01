"use client";

import { useRef, useState, useTransition } from "react";
import { createProofUploadUrl, uploadProofFile } from "@/actions/uploads";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  friendlyUploadError,
  proofUploadHint,
  resolveProofContentType,
  type ProofUploadKind,
} from "@/lib/uploads/proof-mime";
import { captureGeoPosition } from "@/lib/geo/capture-position";
import {
  getVideoDurationSeconds,
  isVideoFile,
  prepareProofFileForUpload,
} from "@/lib/uploads/prepare-proof-file";
import { uploadFileToSignedUrl } from "@/lib/uploads/upload-with-progress";

async function runProofUpload(
  file: File,
  folder: string,
  entityId: string,
  allowVideo = false,
  companyId?: string,
  videoKind: "service" | "installation" = "service",
  kind: "photo" | "video" | "pdf" | "mixed" = "mixed",
  onProgress?: (percent: number | null) => void
): Promise<string> {
  onProgress?.(null); // preparing
  const prepared = await prepareProofFileForUpload(file, {
    allowVideo: allowVideo || kind === "video",
    videoKind,
    kind,
  });

  // Prefer signed URL → storage (no Vercel body / MB cap) whenever companyId is known.
  if (companyId) {
    const contentType = resolveProofContentType(
      {
        name: prepared.name,
        type: prepared.type,
      },
      kind
    );
    const duration = isVideoFile(prepared)
      ? await getVideoDurationSeconds(prepared)
      : undefined;
    const signed = await createProofUploadUrl({
      folder,
      entityId,
      contentType,
      durationSeconds: duration,
      allowVideo: allowVideo || kind === "video" || isVideoFile(prepared),
      videoKind,
    });
    if (!signed.ok) throw new Error(signed.error);

    if (signed.signedUrl) {
      onProgress?.(0);
      await uploadFileToSignedUrl(signed.signedUrl, prepared, {
        contentType: signed.contentType,
        onProgress,
      });
      return signed.publicUrl;
    }

    // Fallback without byte progress
    const { error } = await createClient()
      .storage.from("proofs")
      .uploadToSignedUrl(signed.path, signed.token, prepared, {
        contentType: signed.contentType,
      });
    if (error) throw new Error(error.message);
    onProgress?.(100);
    return signed.publicUrl;
  }

  const fd = new FormData();
  fd.set("file", prepared);
  fd.set("folder", folder);
  fd.set("entityId", entityId);
  fd.set("proofKind", kind);
  if ((allowVideo || kind === "video") && isVideoFile(prepared)) {
    const duration = await getVideoDurationSeconds(prepared);
    fd.set("allowVideo", "true");
    fd.set("durationSeconds", String(duration));
    fd.set("videoKind", videoKind);
  }
  onProgress?.(null);
  const result = await uploadProofFile(fd);
  if (!result.ok) throw new Error(result.error);
  onProgress?.(100);
  return result.publicUrl;
}

/** Small file picker that uploads to Supabase `proofs` and returns a public URL. */
export function ProofUploadButton({
  folder,
  entityId,
  onUploaded,
  label = "Upload photo",
  allowVideo = false,
  companyId,
  videoKind = "service",
  kind = "mixed",
  /** When true, picker accepts up to 4 files and calls onUploaded for each. */
  multiple = false,
  maxFiles = 4,
}: {
  folder: string;
  entityId: string;
  onUploaded: (publicUrl: string) => void;
  label?: string;
  allowVideo?: boolean;
  companyId?: string;
  videoKind?: "service" | "installation";
  kind?: ProofUploadKind;
  multiple?: boolean;
  maxFiles?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [batchProgress, setBatchProgress] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={
          allowVideo
            ? "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,application/pdf,.jpg,.jpeg,.png,.webp,.mp4,.mov,.webm,.pdf"
            : "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
        }
        className="hidden"
        onChange={(e) => {
          const picked = multiple
            ? Array.from(e.target.files ?? []).slice(0, Math.max(1, maxFiles))
            : e.target.files?.[0]
              ? [e.target.files[0]]
              : [];
          e.target.value = "";
          if (picked.length === 0) return;
          setError(null);
          startTransition(async () => {
            try {
              let i = 0;
              for (const file of picked) {
                i += 1;
                if (multiple && picked.length > 1) {
                  setBatchProgress(`Uploading ${i} of ${picked.length}…`);
                }
                const publicUrl = await runProofUpload(
                  file,
                  folder,
                  entityId,
                  allowVideo,
                  companyId,
                  videoKind,
                  kind
                );
                onUploaded(publicUrl);
              }
              setBatchProgress(null);
            } catch (err) {
              setBatchProgress(null);
              setError(friendlyUploadError(err));
            }
          });
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
      >
        {pending ? batchProgress ?? "Uploading…" : label}
      </Button>
      {error && <p className="text-xs text-[var(--error)]">{error}</p>}
    </div>
  );
}

/** Visible upload field (file picker) for proof sections. */
export function ProofUploadField({
  folder,
  entityId,
  onUploaded,
  disabled = false,
  hint,
  accept,
  capture,
  label = "Choose file to upload",
  allowVideo = false,
  companyId,
  videoKind = "service",
  kind,
  requireGeo = false,
}: {
  folder: string;
  entityId: string;
  onUploaded: (
    publicUrl: string,
    geo?: { latitude: number; longitude: number } | null
  ) => void | Promise<void>;
  disabled?: boolean;
  hint?: string;
  accept?: string;
  capture?: boolean | "user" | "environment";
  label?: string;
  allowVideo?: boolean;
  companyId?: string;
  videoKind?: "service" | "installation";
  kind?: ProofUploadKind;
  requireGeo?: boolean;
}) {
  const acceptLooksPdfOnly =
    Boolean(accept) &&
    /pdf/i.test(accept!) &&
    !/image|jpe?g|png|webp|video|mp4|mov/i.test(accept!);
  // Default (undefined) → photo for install/survey safety. Explicit kind="mixed" keeps PDF+image.
  const resolvedKind: ProofUploadKind =
    kind ??
    (acceptLooksPdfOnly ? "pdf" : allowVideo ? "mixed" : "photo");
  const resolvedHintBase =
    hint ??
    proofUploadHint(resolvedKind, {
      videoMaxSeconds: videoKind === "installation" ? 180 : 59,
    });
  const resolvedHint = requireGeo
    ? `${resolvedHintBase} · GPS must be on`
    : resolvedHintBase;
  const resolvedAccept =
    accept ??
    (resolvedKind === "video"
      ? "video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
      : resolvedKind === "pdf"
        ? "application/pdf,.pdf"
        : resolvedKind === "photo"
          ? "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          : "image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf");

  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  /** null = preparing / indeterminate; 0–100 = upload bytes */
  const [progress, setProgress] = useState<number | null>(null);

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept={
          allowVideo && resolvedKind === "mixed"
            ? `${resolvedAccept},video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm`
            : resolvedAccept
        }
        capture={capture === true ? "environment" : capture || undefined}
        className="hidden"
        disabled={disabled || pending}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(null);
          setFileName(file.name);
          setProgress(null);
          startTransition(async () => {
            try {
              let geo: { latitude: number; longitude: number } | null = null;
              if (requireGeo) {
                geo = await captureGeoPosition();
              }
              const publicUrl = await runProofUpload(
                file,
                folder,
                entityId,
                allowVideo || resolvedKind === "video",
                companyId,
                videoKind,
                resolvedKind,
                setProgress
              );
              try {
                await onUploaded(publicUrl, geo);
                setProgress(null);
              } catch (callbackErr) {
                setError(friendlyUploadError(callbackErr));
              }
            } catch (err) {
              setFileName(null);
              setProgress(null);
              setError(friendlyUploadError(err));
            }
          });
        }}
      />
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => inputRef.current?.click()}
        className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--bg)] px-4 py-5 text-center transition hover:border-[var(--primary)] hover:bg-[var(--primary-faint)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="text-sm font-semibold text-[var(--primary)]">
          {pending
            ? progress == null
              ? "Preparing…"
              : `Uploading… ${progress}%`
            : label}
        </span>
        <span className="mt-1 text-xs text-[var(--text-muted)]">
          {fileName && pending ? fileName : resolvedHint}
        </span>
        {pending && (
          <div
            className="mt-3 h-2 w-full max-w-xs overflow-hidden rounded-full bg-[var(--border)]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress ?? undefined}
            aria-label="Upload progress"
          >
            <div
              className={`h-full rounded-full bg-[var(--primary)] transition-[width] duration-150 ease-out ${
                progress == null ? "w-1/3 animate-pulse" : ""
              }`}
              style={progress == null ? undefined : { width: `${progress}%` }}
            />
          </div>
        )}
      </button>
      {error && (
        <p className="text-xs font-medium text-[var(--error)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
