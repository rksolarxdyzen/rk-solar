"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { QuotationsList } from "@/components/quotations/quotations-list";
import { PageHeader } from "@/components/layout/page-header";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { hasAuth, roleIn } from "@/lib/local-first/access";
import { quotationsOptions } from "@/lib/local-first/queries";
import {
  countDeletedQuotations,
  getQuotationDeleteBlockers,
} from "@/lib/quotations/actions/quotation";

export default function QuotationsPage() {
  const { profile, authorities, companyId } = useLocalFirstSession();
  const router = useRouter();
  const can =
    roleIn(profile, ["admin", "sales_manager", "sales_executive"]) ||
    hasAuth(authorities, "view_quotations") ||
    hasAuth(authorities, "create_quotations");
  const canCreate =
    roleIn(profile, ["admin", "sales_manager", "sales_executive"]) ||
    hasAuth(authorities, "create_quotations") ||
    hasAuth(authorities, "manage_quotations");
  const canEditQuotationTemplate =
    roleIn(profile, ["admin"]) || hasAuth(authorities, "manage_quotations");
  const canDeleteQuotations =
    roleIn(profile, ["admin"]) || hasAuth(authorities, "manage_quotations");
  const canViewRecycleBin = canDeleteQuotations;

  const { data: quotes = [], isPending } = useQuery(quotationsOptions(companyId));
  const [binCount, setBinCount] = useState(0);
  const [deleteBlockers, setDeleteBlockers] = useState<Record<string, string[]>>(
    {}
  );

  useEffect(() => {
    if (!can) router.replace("/pipeline");
  }, [can, router]);

  useEffect(() => {
    if (!canViewRecycleBin) return;
    void countDeletedQuotations()
      .then(setBinCount)
      .catch(() => setBinCount(0));
  }, [canViewRecycleBin, quotes.length]);

  useEffect(() => {
    if (!canDeleteQuotations || quotes.length === 0) {
      setDeleteBlockers({});
      return;
    }
    void getQuotationDeleteBlockers(quotes.map((q) => q.id))
      .then(setDeleteBlockers)
      .catch(() => setDeleteBlockers({}));
  }, [canDeleteQuotations, quotes]);

  if (!can) return null;
  if (isPending && quotes.length === 0) {
    return (
      <div className="min-h-[40vh]" aria-busy="true" aria-label="Loading quotations" />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Others"
        title="Quotes"
        subtitle="Solar turnkey quotes and non-solar product quotes — linked to leads or custom customers."
        className="mb-0"
        actions={
          <>
            {canViewRecycleBin && (
              <Link
                href="/quotations/bin"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
              >
                <Trash2 className="h-4 w-4" />
                Recycle bin{binCount > 0 ? ` (${binCount})` : ""}
              </Link>
            )}
            {canEditQuotationTemplate && (
              <Link
                href="/quotations/template"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
              >
                <Settings2 className="h-4 w-4" />
                Template
              </Link>
            )}
            {canCreate && (
              <>
                <Link
                  href="/quotations/new?kind=solar"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--primary-hover)]"
                >
                  <Plus className="h-4 w-4" />
                  New solar quote
                </Link>
                <Link
                  href="/quotations/new?kind=non_solar"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
                >
                  <Plus className="h-4 w-4" />
                  New non-solar quote
                </Link>
              </>
            )}
          </>
        }
      />
      <QuotationsList
        quotes={quotes as Parameters<typeof QuotationsList>[0]["quotes"]}
        canCreate={canCreate}
        canDelete={canDeleteQuotations}
        deleteBlockers={deleteBlockers}
      />
    </div>
  );
}
