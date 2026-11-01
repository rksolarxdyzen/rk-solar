/** Supabase storage bucket used for uploaded proofs, catalog and brand images. */
export const ATTACHMENTS_BUCKET = "proofs";

/** Public URL for an object in the attachments bucket. */
export function getStoragePublicUrl(storagePath: string, bucket = ATTACHMENTS_BUCKET) {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) return storagePath;
  return `${base}/storage/v1/object/public/${bucket}/${storagePath}`;
}

/** Extract proofs object key from a public Storage URL (or return the path as-is). */
export function proofsStoragePathFromUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  const marker = `/object/public/${ATTACHMENTS_BUCKET}/`;
  const i = trimmed.indexOf(marker);
  if (i >= 0) {
    try {
      return decodeURIComponent(trimmed.slice(i + marker.length).split("?")[0] ?? "");
    } catch {
      return trimmed.slice(i + marker.length).split("?")[0] ?? null;
    }
  }
  if (!trimmed.startsWith("http") && trimmed.includes("/")) return trimmed;
  return null;
}
