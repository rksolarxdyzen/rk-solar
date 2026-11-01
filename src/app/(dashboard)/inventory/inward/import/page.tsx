import { redirect } from "next/navigation";
import Link from "next/link";
import { InventoryHeader } from "@/components/inventory/inventory-header";
import { InvoiceInwardImport } from "@/components/inventory/invoice-inward-import";
import { getInventoryAccess, getPickerItems } from "@/lib/inventory/queries";

export const dynamic = "force-dynamic";

export default async function InwardInvoiceImportPage() {
  const ctx = await getInventoryAccess();
  if (!ctx) redirect("/login");
  if (!ctx.access.canInward) redirect("/inventory");
  const items = await getPickerItems();

  return (
    <div className="mx-auto max-w-4xl">
      <InventoryHeader
        title="Import invoice / challan"
        subtitle="OCR or PDF text → preview → stock inward"
        backHref="/inventory/inward/new"
        actions={false}
      />
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        Prefer typing by hand?{" "}
        <Link href="/inventory/inward/new" className="font-semibold text-[var(--primary)] hover:underline">
          Open manual stock inward
        </Link>
        .
      </p>
      <InvoiceInwardImport items={items} />
    </div>
  );
}
