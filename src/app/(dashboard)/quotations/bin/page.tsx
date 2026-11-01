import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { QuotationRecycleBin } from "@/components/quotations/quotation-recycle-bin";
import { getQuotationContext } from "@/lib/quotations/context";
import { listDeletedQuotations } from "@/lib/quotations/actions/quotation";

export default async function QuotationRecycleBinPage() {
  const ctx = await getQuotationContext().catch(() => null);
  if (!ctx?.canViewRecycleBin) redirect("/quotations");

  const res = await listDeletedQuotations();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Quotes"
        title="Recycle bin"
        subtitle="Deleted quotations. Restore puts them back in the Quotes list with the same number and items."
        className="mb-0"
        actions={
          <Link
            href="/quotations"
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Quotes
          </Link>
        }
      />

      {res.ok ? (
        <QuotationRecycleBin
          rows={res.rows}
          canRestore={ctx.canRestoreQuotations}
          canPurge={ctx.canPurgeQuotations}
        />
      ) : (
        <p className="rounded-xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--error)]">
          {res.error}
        </p>
      )}
    </div>
  );
}
