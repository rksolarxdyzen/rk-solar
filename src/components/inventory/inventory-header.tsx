import Link from "next/link";
import { ArrowLeft, BarChart3, Building2, FileSpreadsheet, History, PackageMinus, PackagePlus, Plus, Truck } from "lucide-react";
import type { InventoryAccess } from "@/lib/inventory/queries";
import { OfflineBanner } from "@/components/inventory/offline-banner";

export function InventoryHeader({
  title,
  subtitle,
  backHref,
  access,
  actions = true,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  access?: InventoryAccess;
  actions?: boolean;
}) {
  return (
    <>
    <OfflineBanner />
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-2">
        {backHref && (
          <Link
            href={backHref}
            className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg)]"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-[var(--text-muted)]">{subtitle}</p>}
        </div>
      </div>
      {actions && access && (
        <div className="flex flex-wrap gap-2">
          {access.canInward && (
            <Link
              href="/inventory/inward/new"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
            >
              <PackagePlus className="h-4 w-4" /> Stock inward
            </Link>
          )}
          {access.canInward && (
            <Link
              href="/inventory/inward/import"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)]"
            >
              <FileSpreadsheet className="h-4 w-4" /> Invoice OCR
            </Link>
          )}
          {access.canDispatch && (
            <Link
              href="/inventory/dispatch/new"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
            >
              <Truck className="h-4 w-4" /> Dispatch
            </Link>
          )}
          {access.canReturn && (
            <Link
              href="/inventory/returns/new"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)]"
            >
              <PackageMinus className="h-4 w-4" /> Return
            </Link>
          )}
          <Link
            href="/inventory/movements"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)]"
          >
            <History className="h-4 w-4" /> Movements
          </Link>
          {(access.canDispatch || access.canManageItems) && (
            <Link
              href="/inventory/parties"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)]"
            >
              <Building2 className="h-4 w-4" /> Parties
            </Link>
          )}
          <Link
            href="/inventory/report"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)]"
          >
            <BarChart3 className="h-4 w-4" /> Report
          </Link>
          {access.canInward && (
            <Link
              href="/inventory/import"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)]"
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel import
            </Link>
          )}
          {access.canManageItems && (
            <Link
              href="/inventory/items/new"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)]"
            >
              <Plus className="h-4 w-4" /> New item
            </Link>
          )}
        </div>
      )}
    </div>
    </>
  );
}
