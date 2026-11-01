import Link from "next/link";
import { redirect } from "next/navigation";
import { getQuotationContext } from "@/lib/quotations/context";
import { getQuotationSettings, getCompany } from "@/lib/quotations/data/lookups";
import { resolveQuotationTemplate, buildCompanyPrintInfo } from "@/lib/quotations/quotation-print";
import { QuotationTemplateEditor } from "@/components/quotations/quotation-template-editor";
import { BRAND } from "@/lib/quotations/brand";
import { resolveBankAccounts } from "@/lib/quotations/bank-accounts";

export const dynamic = "force-dynamic";

export default async function QuotationTemplatePage() {
  const { canViewQuotations, canEditQuotationTemplate } = await getQuotationContext();

  if (!canViewQuotations || !canEditQuotationTemplate) {
    redirect("/quotations");
  }

  const [settings, company] = await Promise.all([getQuotationSettings(), getCompany()]);
  const resolved = resolveQuotationTemplate(settings);
  const template = { ...resolved, bankAccounts: resolveBankAccounts(resolved, settings) };
  const companyInfo = buildCompanyPrintInfo(settings, company, template);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 text-xs font-medium text-[var(--text-muted)]">
            <Link href="/quotations" className="hover:text-[var(--primary)]">
              Quotations
            </Link>
            <span className="mx-1.5">/</span>
            <span>Template</span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)]">
            Proposal template
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Edit each page of the 5-page solar proposal — cover, offer, system package, scope &amp;
            savings, and thank you — plus calculation defaults.
          </p>
        </div>
        <Link
          href="/quotations"
          className="inline-flex min-h-10 items-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] transition hover:bg-[var(--bg)]"
        >
          ← Back to quotations
        </Link>
      </div>

      <QuotationTemplateEditor
        initial={template}
        company={companyInfo}
        bankDefaults={{
          fromName: settings?.from_name ?? companyInfo.name,
          fromPhone: settings?.from_phone ?? companyInfo.phone ?? "",
          fromEmail: settings?.from_email ?? companyInfo.email ?? "",
          bankAccountName: settings?.bank_account_name ?? BRAND.bank.accountName,
          bankName: settings?.bank_name ?? BRAND.bank.bankName,
          accountNumber: settings?.account_number ?? BRAND.bank.accountNumber,
          ifscCode: settings?.ifsc_code ?? BRAND.bank.ifscCode,
          branch: settings?.branch?.trim() || BRAND.bank.branch,
        }}
        canEdit={canEditQuotationTemplate}
      />
    </div>
  );
}
