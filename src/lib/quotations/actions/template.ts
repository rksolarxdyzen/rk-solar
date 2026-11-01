"use server";

import { revalidatePath } from "next/cache";
import { getQuotationContext } from "@/lib/quotations/context";
import {
  DEFAULT_SOLAR_TEMPLATE,
  normalizeSolarTemplate,
  resolvePreviousWorkPhotos,
  type SolarProposalTemplate,
} from "@/lib/quotations/quotation-template";
import { ATTACHMENTS_BUCKET, getStoragePublicUrl } from "@/lib/storage-url";
import { paymentQrAccount } from "@/lib/quotations/bank-accounts";

export type QuotationCompanyBankSettings = {
  fromName?: string;
  fromPhone?: string;
  fromEmail?: string;
  bankAccountName?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branch?: string;
};

export type TemplateAssetKind = "cover" | "savings" | "qr" | "logo" | "install" | "panel";

export type TemplateActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

const TEMPLATE_ASSET_FIELDS: Record<TemplateAssetKind, keyof SolarProposalTemplate> = {
  cover: "coverImageUrl",
  savings: "systemImageUrl",
  qr: "qrCodeUrl",
  logo: "logoUrl",
  install: "installImageUrl",
  panel: "panelImageUrl",
};

const TEMPLATE_ASSET_FOLDERS: Record<TemplateAssetKind, string> = {
  cover: "cover",
  savings: "savings",
  qr: "qr",
  logo: "logo",
  install: "install",
  panel: "panel",
};

function storagePathFromPublicUrl(url: string, bucket = ATTACHMENTS_BUCKET): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

function errMessage(e: unknown, fallback: string) {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object" && "message" in e && typeof (e as { message: unknown }).message === "string") {
    return (e as { message: string }).message;
  }
  return fallback;
}

function clip(value: string | undefined | null, max: number): string | null {
  const trimmed = value?.trim() || "";
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

/** Best-effort delete — never fail the parent action if Storage RLS blocks remove. */
async function deleteTemplateAssetIfOwned(
  supabase: Awaited<ReturnType<typeof getQuotationContext>>["supabase"],
  companyId: string,
  url: string | undefined
) {
  if (!url?.trim()) return;
  const storagePath = storagePathFromPublicUrl(url.trim());
  const prefix = `${companyId}/quotation-template/`;
  if (!storagePath?.startsWith(prefix)) return;
  await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]).catch(() => undefined);
}

async function requireTemplateManage() {
  const ctx = await getQuotationContext();
  if (!ctx.canEditQuotationTemplate) {
    throw new Error("You do not have permission to change the quotation template.");
  }
  return ctx;
}

async function loadCompanyTemplate() {
  const { supabase, companyId } = await requireTemplateManage();
  const { data, error } = await supabase
    .from("quotation_company_settings")
    .select("quotation_template, quotation_terms, quotation_notes_footer, from_name, from_phone")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const template = normalizeSolarTemplate(data?.quotation_template, {
    termsText: data?.quotation_terms,
    footerText: data?.quotation_notes_footer,
    preparedBy: data?.from_name,
    preparedByPhone: data?.from_phone,
  });
  return { supabase, companyId, template };
}

async function persistTemplate(
  supabase: Awaited<ReturnType<typeof getQuotationContext>>["supabase"],
  companyId: string,
  template: SolarProposalTemplate
) {
  const { error } = await supabase.from("quotation_company_settings").upsert(
    {
      company_id: companyId,
      quotation_template: template,
      quotation_terms: template.termsText || null,
      quotation_notes_footer: template.footerText || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );
  if (error) throw new Error(error.message);
  // Do not revalidate the template editor route — remounting mid-edit surfaces opaque RSC digests.
  revalidatePath("/quotations");
  revalidatePath("/quotations/new");
}

export async function saveQuotationTemplate(
  input: Partial<SolarProposalTemplate>,
  company?: QuotationCompanyBankSettings
): Promise<TemplateActionResult> {
  try {
    const { supabase, companyId } = await requireTemplateManage();

    const template = normalizeSolarTemplate({
      ...DEFAULT_SOLAR_TEMPLATE,
      ...input,
    });

    const enabledAccounts = template.bankAccounts.filter((a) => a.enabled);
    const primary = enabledAccounts[0] ?? template.bankAccounts[0];
    if (primary) {
      const qrAccount = paymentQrAccount(enabledAccounts);
      template.bankAccountType = primary.accountType || template.bankAccountType;
      if (qrAccount) {
        template.qrCodeUrl = qrAccount.qrUrl;
        template.upiId = qrAccount.upiId;
      }
      company = {
        ...company,
        bankAccountName: primary.accountName,
        bankName: primary.bankName,
        accountNumber: primary.accountNumber,
        ifscCode: primary.ifscCode,
        branch: primary.branch,
      };
    }

    const payload: Record<string, unknown> = {
      company_id: companyId,
      quotation_template: template,
      quotation_terms: template.termsText || null,
      quotation_notes_footer: template.footerText || null,
      updated_at: new Date().toISOString(),
    };

    if (company) {
      if (company.fromName !== undefined) payload.from_name = clip(company.fromName, 160);
      if (company.fromPhone !== undefined) payload.from_phone = clip(company.fromPhone, 40);
      if (company.fromEmail !== undefined) payload.from_email = clip(company.fromEmail, 160);
      if (company.bankAccountName !== undefined) payload.bank_account_name = clip(company.bankAccountName, 160);
      if (company.bankName !== undefined) payload.bank_name = clip(company.bankName, 200);
      if (company.accountNumber !== undefined) payload.account_number = clip(company.accountNumber, 160);
      if (company.ifscCode !== undefined) payload.ifsc_code = clip(company.ifscCode, 80);
      if (company.branch !== undefined) payload.branch = clip(company.branch, 200);
    }

    const { error } = await supabase
      .from("quotation_company_settings")
      .upsert(payload, { onConflict: "company_id" });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/quotations");
    revalidatePath("/quotations/new");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Failed to save template") };
  }
}

/** Replace one of the six Previous Work photos (slot 0–5). */
export async function replacePreviousWorkPhoto(
  formData: FormData
): Promise<TemplateActionResult<{ photos: SolarProposalTemplate["previousWorkPhotos"] }>> {
  try {
    const { supabase, companyId, template } = await loadCompanyTemplate();
    const slot = Number(formData.get("slot"));
    if (!Number.isInteger(slot) || slot < 0 || slot > 5) {
      return { ok: false, error: "Invalid photo slot" };
    }

    const file = formData.get("file") as File | null;
    if (!file) return { ok: false, error: "No file provided" };
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "Only image files are allowed" };
    }
    // Stay under Next/Vercel server action body limit (~4.5 MB)
    if (file.size > 3.5 * 1024 * 1024) {
      return { ok: false, error: "Image must be under 3.5 MB" };
    }

    const ext =
      (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const storagePath = `${companyId}/quotation-template/previous-work/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) return { ok: false, error: uploadError.message };

    const url = getStoragePublicUrl(storagePath);
    const caption = String(formData.get("caption") || "").trim() || undefined;
    const photos = [...resolvePreviousWorkPhotos(template.previousWorkPhotos)];
    const previous = photos[slot];
    photos[slot] = {
      storagePath,
      url,
      ...(caption ? { caption } : previous.caption ? { caption: previous.caption } : {}),
    };

    if (previous?.storagePath?.startsWith(`${companyId}/quotation-template/previous-work/`)) {
      await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .remove([previous.storagePath])
        .catch(() => undefined);
    }

    const next: SolarProposalTemplate = {
      ...template,
      previousWorkPhotos: photos,
    };
    await persistTemplate(supabase, companyId, next);
    return { ok: true, photos: next.previousWorkPhotos };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Upload failed") };
  }
}

/** Remove a gallery image from the template and delete it from the storage bucket. */
export async function removePreviousWorkPhoto(
  storagePath: string
): Promise<TemplateActionResult<{ photos: SolarProposalTemplate["previousWorkPhotos"] }>> {
  try {
    const { supabase, companyId, template } = await loadCompanyTemplate();
    if (!storagePath) return { ok: false, error: "Missing storage path" };

    const prefix = `${companyId}/quotation-template/previous-work/`;
    if (!storagePath.startsWith(prefix)) {
      return { ok: false, error: "Invalid photo path" };
    }

    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]).catch(() => undefined);

    const next: SolarProposalTemplate = {
      ...template,
      previousWorkPhotos: template.previousWorkPhotos.filter((p) => p.storagePath !== storagePath),
    };
    await persistTemplate(supabase, companyId, next);
    return { ok: true, photos: next.previousWorkPhotos };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Failed to remove photo") };
  }
}

/** Upload a bank account's payment QR. Returns the URL; it is saved with the template on Save. */
export async function uploadBankAccountQr(
  formData: FormData
): Promise<TemplateActionResult<{ url: string }>> {
  try {
    const { supabase, companyId } = await requireTemplateManage();
    const file = formData.get("file") as File | null;
    if (!file) return { ok: false, error: "No file provided" };
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "Only image files are allowed" };
    }
    if (file.size > 3.5 * 1024 * 1024) {
      return { ok: false, error: "Image must be under 3.5 MB (Vercel upload limit)" };
    }
    const ext =
      (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const storagePath = `${companyId}/quotation-template/qr/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) return { ok: false, error: uploadError.message };
    return { ok: true, url: getStoragePublicUrl(storagePath) };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Upload failed") };
  }
}

/** Upload a page image (cover, logo, QR, savings, install, panel) for the solar proposal template. */
export async function uploadTemplateAsset(
  formData: FormData
): Promise<TemplateActionResult<{ url: string; storagePath: string; field: keyof SolarProposalTemplate }>> {
  try {
    const { supabase, companyId, template } = await loadCompanyTemplate();
    const kind = String(formData.get("kind") || "") as TemplateAssetKind;
    if (!TEMPLATE_ASSET_FIELDS[kind]) {
      return { ok: false, error: "Invalid template image type" };
    }

    const file = formData.get("file") as File | null;
    if (!file) return { ok: false, error: "No file provided" };
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "Only image files are allowed" };
    }
    const maxSize = 3.5 * 1024 * 1024;
    if (file.size > maxSize) {
      return { ok: false, error: "Image must be under 3.5 MB (Vercel upload limit)" };
    }

    const ext =
      (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const folder = TEMPLATE_ASSET_FOLDERS[kind];
    const storagePath = `${companyId}/quotation-template/${folder}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) return { ok: false, error: uploadError.message };

    const url = getStoragePublicUrl(storagePath);
    const field = TEMPLATE_ASSET_FIELDS[kind];
    const previousUrl = template[field] as string;

    await deleteTemplateAssetIfOwned(supabase, companyId, previousUrl);

    const next: SolarProposalTemplate = { ...template, [field]: url };
    await persistTemplate(supabase, companyId, next);

    return { ok: true, url, storagePath, field };
  } catch (e) {
    return { ok: false, error: errMessage(e, "Upload failed") };
  }
}
