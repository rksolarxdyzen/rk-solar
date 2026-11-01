"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { getSupabaseEnv } from "@/lib/env";
import {
  assertInstallVideoDuration,
  assertProofFileSize,
  assertServiceTicketVideoDuration,
  fileExtension,
  friendlyUploadError,
  isVideoContentType,
  readFormDataFile,
  resolveProofContentType,
} from "@/lib/uploads/proof-mime";

const BUCKET = "proofs";

async function canUploadProofs(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "ops_coordinator" ||
    profile.role === "installation_crew" ||
    profile.role === "service_engineer" ||
    profile.role === "service_supervisor" ||
    profile.role === "liaison" ||
    profile.role === "surveyor" ||
    profile.role === "feasibility" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    profile.role === "tele_caller" ||
    profile.role === "dealer" ||
    (await hasAuthority(profile.id, "upload_installation_proofs")) ||
    (await hasAuthority(profile.id, "upload_feasibility_report")) ||
    (await hasAuthority(profile.id, "resolve_service_ticket")) ||
    (await hasAuthority(profile.id, "manage_portal_documents")) ||
    (await hasAuthority(profile.id, "conduct_survey")) ||
    (await hasAuthority(profile.id, "add_edit_leads")) ||
    (await hasAuthority(profile.id, "log_sales_activity")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

export type UploadProofResult =
  | { ok: true; path: string; publicUrl: string }
  | { ok: false; error: string };

export type SignedProofUploadResult =
  | {
      ok: true;
      path: string;
      token: string;
      signedUrl: string;
      publicUrl: string;
      contentType: string;
    }
  | { ok: false; error: string };

/** Authorize a larger staff service-ticket video without sending it through Vercel. */
export async function createProofUploadUrl(input: {
  folder: string;
  entityId: string;
  contentType: string;
  durationSeconds?: number;
  allowVideo?: boolean;
  videoKind?: "service" | "installation";
}): Promise<SignedProofUploadResult> {
  try {
    const profile = await requireAuth();
    if (!(await canUploadProofs(profile))) {
      return { ok: false, error: "Missing authority to upload proofs" };
    }
    const contentType = resolveProofContentType({
      name: `upload.${input.contentType.split("/").pop() || "bin"}`,
      type: input.contentType,
    });
    if (isVideoContentType(contentType)) {
      if (!input.allowVideo) {
        return { ok: false, error: "Videos are only allowed for site completion or service tickets." };
      }
      try {
        if (input.videoKind === "installation") {
          assertInstallVideoDuration(Number(input.durationSeconds));
        } else {
          assertServiceTicketVideoDuration(Number(input.durationSeconds));
        }
      } catch (err) {
        return { ok: false, error: friendlyUploadError(err) };
      }
    }

    const folder = String(input.folder || "misc").replace(/[^a-z0-9_-]/gi, "");
    const entityId = String(input.entityId || "general").replace(
      /[^a-z0-9_-]/gi,
      ""
    );
    const ext = isVideoContentType(contentType)
      ? contentType === "video/quicktime"
        ? "mov"
        : contentType === "video/webm"
          ? "webm"
          : "mp4"
      : contentType === "application/pdf"
        ? "pdf"
        : "jpg";
    const path = `${profile.company_id}/${folder}/${entityId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    const supabase = await createClient();
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data?.token) {
      return {
        ok: false,
        error: friendlyUploadError(error?.message ?? "Could not prepare file upload"),
      };
    }
    const { url } = getSupabaseEnv();
    const signedUrl =
      data.signedUrl ||
      `${url.replace(/\/$/, "")}/storage/v1/object/upload/sign/${path}?token=${encodeURIComponent(data.token)}`;
    return {
      ok: true,
      path,
      token: data.token,
      signedUrl,
      contentType,
      publicUrl: `${url.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`,
    };
  } catch (err) {
    return { ok: false, error: friendlyUploadError(err) };
  }
}

/**
 * Upload a proof file to the public `proofs` bucket.
 * Returns a result object (never throws) so production digests don't replace the message.
 */
export async function uploadProofFile(formData: FormData): Promise<UploadProofResult> {
  try {
    const profile = await requireAuth();
    if (!(await canUploadProofs(profile))) {
      return { ok: false, error: "Missing authority to upload proofs" };
    }

    const { blob, name } = readFormDataFile(formData);
    assertProofFileSize(blob.size);
    const kindRaw = String(formData.get("proofKind") || "mixed");
    const kind =
      kindRaw === "photo" || kindRaw === "video" || kindRaw === "pdf" || kindRaw === "mixed"
        ? kindRaw
        : "mixed";
    const contentType = resolveProofContentType({ name, type: blob.type }, kind);
    if (isVideoContentType(contentType)) {
      if (formData.get("allowVideo") !== "true" && kind !== "video") {
        return {
          ok: false,
          error: "This field only accepts photos: JPG, PNG, or WebP.",
        };
      }
      try {
        if (formData.get("videoKind") === "installation") {
          assertInstallVideoDuration(Number(formData.get("durationSeconds")));
        } else {
          assertServiceTicketVideoDuration(Number(formData.get("durationSeconds")));
        }
      } catch (err) {
        return { ok: false, error: friendlyUploadError(err) };
      }
    }

    const folder = String(formData.get("folder") ?? "misc").replace(/[^a-z0-9_-]/gi, "");
    const entityId = String(formData.get("entityId") ?? "general").replace(
      /[^a-z0-9_-]/gi,
      ""
    );

    const ext = fileExtension(
      name,
      contentType === "application/pdf"
        ? "pdf"
        : isVideoContentType(contentType)
          ? "mp4"
          : "jpg"
    );
    const path = `${profile.company_id}/${folder}/${entityId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const supabase = await createClient();
    const buffer = Buffer.from(await blob.arrayBuffer());
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType,
      upsert: false,
    });

    if (error) {
      return { ok: false, error: friendlyUploadError(error.message) };
    }

    const { url } = getSupabaseEnv();
    const publicUrl = `${url.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${path}`;
    return { ok: true, path, publicUrl };
  } catch (err) {
    return { ok: false, error: friendlyUploadError(err) };
  }
}
