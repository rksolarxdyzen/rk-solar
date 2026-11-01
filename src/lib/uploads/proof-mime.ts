/** Shared upload MIME / duration helpers for proof uploads. */

/** Soft target used only for photo compression quality (not a hard reject). */
export const PROOF_PHOTO_COMPRESS_TARGET_BYTES = 3.5 * 1024 * 1024;
/** @deprecated Prefer no hard MB cap; kept for PDF-only checks. */
export const PROOF_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;
/** Sanity ceiling so the browser does not try to load multi-GB files. */
export const PROOF_UPLOAD_HARD_MAX_BYTES = 500 * 1024 * 1024;
export const MAX_SERVICE_TICKET_VIDEO_SECONDS = 59;
/** Site completion videos may be longer than service-ticket clips. */
export const MAX_INSTALL_VIDEO_SECONDS = 180;

export function assertVideoDuration(durationSeconds: number, maxSeconds: number, label = "Video") {
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > maxSeconds
  ) {
    throw new Error(
      `${label} must be ${maxSeconds} seconds or shorter. Choose a shorter video and try again.`
    );
  }
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

export function fileExtension(filename: string, fallback = "jpg") {
  const ext = (filename.split(".").pop() || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  return ext || fallback;
}

export function isVideoContentType(contentType: string) {
  return contentType.toLowerCase().startsWith("video/");
}

/** FormData file entries can be File or Blob depending on runtime. */
export function readFormDataFile(
  formData: FormData,
  key = "file"
): { blob: Blob; name: string } {
  const raw = formData.get(key);
  if (!(raw instanceof Blob) || raw.size <= 0) {
    throw new Error("Choose a file to upload");
  }
  const name = raw instanceof File && raw.name ? raw.name : "upload.jpg";
  return { blob: raw, name };
}

export function assertProofFileSize(size: number, max = PROOF_UPLOAD_HARD_MAX_BYTES) {
  if (size <= 0) {
    throw new Error("This file is empty. Take the photo again or choose another file.");
  }
  if (size > max) {
    throw new Error(
      `This file is too large to upload (over ${Math.round(max / (1024 * 1024))} MB). Choose a smaller file.`
    );
  }
}

export type ProofUploadKind = "photo" | "video" | "pdf" | "mixed";

export function proofUploadHint(kind: ProofUploadKind, opts?: { videoMaxSeconds?: number }) {
  if (kind === "video") {
    const secs = opts?.videoMaxSeconds ?? MAX_INSTALL_VIDEO_SECONDS;
    return `MP4, MOV, or WebM · max ${secs} seconds`;
  }
  if (kind === "pdf") {
    return "PDF only";
  }
  if (kind === "photo") {
    return "JPG, PNG, or WebP (larger photos are compressed automatically)";
  }
  return "JPG, PNG, WebP, or PDF (photos compressed). Videos: MP4/MOV.";
}

export function proofTypeError(kind: ProofUploadKind) {
  if (kind === "video") {
    return `This field only accepts video: MP4, MOV, or WebM. Max ${MAX_INSTALL_VIDEO_SECONDS} seconds.`;
  }
  if (kind === "pdf") {
    return "This field only accepts a PDF.";
  }
  if (kind === "photo") {
    return "This field only accepts photos: JPG, PNG, or WebP. iPhone: set Camera → Formats → Most Compatible.";
  }
  return "This file type isn't supported. Use JPG, PNG, WebP, PDF, MP4, or MOV.";
}

export function resolveProofContentType(
  file: { name: string; type?: string | null },
  kind: ProofUploadKind = "mixed"
) {
  const raw = (file.type || "").toLowerCase().trim();
  if (raw === "image/jpg") return "image/jpeg";
  if (raw && raw !== "application/octet-stream" && ALLOWED_MIMES.has(raw)) {
    return assertKindMatchesType(raw, kind, file.name);
  }
  const fromExt = MIME_BY_EXT[fileExtension(file.name, "")];
  if (fromExt) return assertKindMatchesType(fromExt, kind, file.name);
  if (raw.startsWith("image/") && kind !== "video" && kind !== "pdf") return "image/jpeg";
  throw new Error(proofTypeError(kind));
}

function assertKindMatchesType(contentType: string, kind: ProofUploadKind, filename: string) {
  const isVid = isVideoContentType(contentType);
  const isPdf = contentType === "application/pdf";
  const isImg = contentType.startsWith("image/");
  if (kind === "photo" && !isImg) throw new Error(proofTypeError("photo"));
  if (kind === "video" && !isVid) throw new Error(proofTypeError("video"));
  if (kind === "pdf" && !isPdf) throw new Error(proofTypeError("pdf"));
  if (kind === "photo" && (contentType.includes("heic") || contentType.includes("heif") || /\.heic$/i.test(filename))) {
    throw new Error(
      "HEIC/HEIF photos aren't supported. On iPhone: Settings → Camera → Formats → Most Compatible, then retake as JPG."
    );
  }
  return contentType;
}

export function isAllowedProofUpload(
  file: { name: string; type?: string | null },
  kind: ProofUploadKind = "mixed"
) {
  try {
    resolveProofContentType(file, kind);
    return true;
  } catch {
    return false;
  }
}

export function assertServiceTicketVideoDuration(durationSeconds: number) {
  assertVideoDuration(durationSeconds, MAX_SERVICE_TICKET_VIDEO_SECONDS, "Video");
}

export function assertInstallVideoDuration(durationSeconds: number) {
  assertVideoDuration(durationSeconds, MAX_INSTALL_VIDEO_SECONDS, "Completion video");
}

/** Map framework digests / opaque production errors to a user-facing message. */
export function friendlyUploadError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Upload failed";
  const msg = raw.toLowerCase();

  if (
    msg.includes("server components") ||
    msg.includes("digest") ||
    msg.includes("omitted in production") ||
    msg.includes("body exceeded") ||
    msg.includes("body size") ||
    msg.includes("request entity too large") ||
    msg.includes("payload too large") ||
    msg.includes("413") ||
    msg.includes("failed to find server action")
  ) {
    return "This file is too large for the server path. Try again — photos are compressed, and videos upload directly to storage.";
  }
  if (msg.includes("heic") || msg.includes("heif")) {
    return "HEIC/HEIF photos aren't supported. On iPhone: Settings → Camera → Formats → Most Compatible, then retake as JPG.";
  }
  if (
    msg.includes("row-level security") ||
    msg.includes("violates policy") ||
    msg.includes("unauthorized") ||
    msg.includes("not allowed") ||
    msg.includes("bucket") ||
    msg.includes("maximum allowed size") ||
    msg.includes("file size") ||
    msg.includes("exceeded the maximum")
  ) {
    return "Could not save this file to storage. Check you are signed in, then try again. If it keeps failing, ask admin to run migration 060 (proofs bucket size limit).";
  }
  if (msg.includes("network") || msg.includes("failed to fetch") || msg.includes("timeout")) {
    return "Network error while uploading. Stay on site with signal and try again.";
  }
  if (msg.includes("location") || msg.includes("geolocation") || msg.includes("gps") || msg.includes("permission denied")) {
    return raw;
  }
  if (
    (msg.includes("octet-stream") || msg.includes("mime") || msg.includes("not supported") || (msg.includes("invalid") && msg.includes("type"))) &&
    !msg.includes("this field only")
  ) {
    return "This file type isn't supported. Photos: JPG, PNG, or WebP. Video: MP4, MOV, or WebM (max 3 minutes).";
  }
  if (raw.length > 220) {
    return "Upload failed. Photos: JPG/PNG/WebP. Video: MP4/MOV, max 3 minutes.";
  }
  return raw;
}
