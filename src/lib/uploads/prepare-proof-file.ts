import {
  assertInstallVideoDuration,
  assertServiceTicketVideoDuration,
  PROOF_PHOTO_COMPRESS_TARGET_BYTES,
  PROOF_UPLOAD_HARD_MAX_BYTES,
  fileExtension,
  isVideoContentType,
  isAllowedProofUpload,
} from "@/lib/uploads/proof-mime";

const MAX_IMAGE_DIMENSION = 1920;

function isHeicLike(file: File) {
  const type = (file.type || "").toLowerCase();
  const ext = fileExtension(file.name, "");
  return (
    type.includes("heic") ||
    type.includes("heif") ||
    ext === "heic" ||
    ext === "heif"
  );
}

function isPdf(file: File) {
  const type = (file.type || "").toLowerCase();
  return type === "application/pdf" || fileExtension(file.name, "") === "pdf";
}

function isImageFile(file: File) {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  return ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(
    fileExtension(file.name, "")
  );
}

export function isVideoFile(file: File) {
  const type = (file.type || "").toLowerCase();
  if (isVideoContentType(type)) return true;
  return ["mp4", "webm", "mov"].includes(fileExtension(file.name, ""));
}

export async function getVideoDurationSeconds(file: File): Promise<number> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration);
      video.onerror = () => reject(new Error("Couldn't read this video. Choose an MP4 or MOV file."));
      video.src = objectUrl;
    });
    return duration;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function canvasToJpegBlob(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process this image. Try another photo.");
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );
  if (!blob) throw new Error("Could not compress this image. Try another photo.");
  return blob;
}

async function compressImageFile(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      "Couldn't read this image. Save it as JPG or PNG on your phone and try again."
    );
  }

  try {
    let width = bitmap.width;
    let height = bitmap.height;
    const longest = Math.max(width, height);
    if (longest > MAX_IMAGE_DIMENSION) {
      const scale = MAX_IMAGE_DIMENSION / longest;
      width = Math.max(1, Math.round(width * scale));
      height = Math.max(1, Math.round(height * scale));
    }

    let quality = 0.85;
    let blob = await canvasToJpegBlob(bitmap, width, height, quality);
    while (blob.size > PROOF_PHOTO_COMPRESS_TARGET_BYTES && quality > 0.45) {
      quality -= 0.1;
      blob = await canvasToJpegBlob(bitmap, width, height, quality);
    }

    let scalePass = 0;
    while (blob.size > PROOF_PHOTO_COMPRESS_TARGET_BYTES && scalePass < 3) {
      scalePass += 1;
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
      blob = await canvasToJpegBlob(bitmap, width, height, 0.7);
    }

    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

/**
 * Validate (+ optionally compress photos) before upload.
 * No hard MB reject for photos/videos — they go to storage via signed URL when possible.
 */
export async function prepareProofFileForUpload(
  file: File,
  options: {
    allowVideo?: boolean;
    maxBytes?: number;
    videoKind?: "service" | "installation";
    kind?: "photo" | "video" | "pdf" | "mixed";
  } = {}
): Promise<File> {
  const kind =
    options.kind ??
    (options.allowVideo ? "mixed" : "photo");

  if (file.size <= 0) {
    throw new Error("This file is empty. Take the photo again or choose another file.");
  }
  if (file.size > PROOF_UPLOAD_HARD_MAX_BYTES) {
    throw new Error(
      `This file is over ${Math.round(PROOF_UPLOAD_HARD_MAX_BYTES / (1024 * 1024))} MB, which is too large to upload from the phone. Choose a shorter video or a smaller photo.`
    );
  }
  if (!isAllowedProofUpload(file, kind)) {
    throw new Error(
      kind === "photo"
        ? "This field only accepts photos: JPG, PNG, or WebP. iPhone: Camera → Formats → Most Compatible."
        : kind === "video"
          ? "This field only accepts video: MP4, MOV, or WebM (max 3 minutes)."
          : kind === "pdf"
            ? "This field only accepts a PDF."
            : "This file type isn't supported. Use JPG, PNG, WebP, PDF, MP4, or MOV."
    );
  }
  if (isVideoFile(file)) {
    if (!options.allowVideo && kind !== "video") {
      throw new Error("This field only accepts photos: JPG, PNG, or WebP.");
    }
    const duration = await getVideoDurationSeconds(file);
    if (options.videoKind === "installation" || kind === "video") {
      assertInstallVideoDuration(duration);
    } else {
      assertServiceTicketVideoDuration(duration);
    }
    // Optional caller override only (no default MB cap).
    if (options.maxBytes != null && file.size > options.maxBytes) {
      throw new Error(
        `This video is too large (max ${Math.round(options.maxBytes / (1024 * 1024))} MB). Record a shorter clip or lower quality.`
      );
    }
    return file;
  }
  if (isHeicLike(file)) {
    throw new Error(
      "HEIC/HEIF photos aren't supported. On iPhone: Settings → Camera → Formats → Most Compatible, then retake as JPG."
    );
  }
  if (isPdf(file)) {
    if (kind === "photo" || kind === "video") {
      throw new Error(
        kind === "video"
          ? "This field only accepts video: MP4, MOV, or WebM."
          : "This field only accepts photos: JPG, PNG, or WebP."
      );
    }
    // No separate PDF MB cap — same hard ceiling as other proofs (signed URL path).
    if (options.maxBytes != null && file.size > options.maxBytes) {
      throw new Error(
        `This PDF is too large (max ${Math.round(options.maxBytes / (1024 * 1024))} MB). Compress it or split pages.`
      );
    }
    return file;
  }
  if (!isImageFile(file)) {
    throw new Error("This field only accepts photos: JPG, PNG, or WebP.");
  }

  if (
    file.size <= PROOF_PHOTO_COMPRESS_TARGET_BYTES &&
    (file.type === "image/jpeg" ||
      file.type === "image/jpg" ||
      file.type === "image/png" ||
      file.type === "image/webp" ||
      !file.type)
  ) {
    return file;
  }

  return compressImageFile(file);
}
