import Link from "next/link";
import { openCustomerPortal } from "@/actions/liaison";
import { PortalDashboard } from "@/components/portal/portal-dashboard";
import { PortalLookupForm } from "@/components/portal/portal-lookup-form";

export default async function PortalCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ phone?: string }>;
}) {
  const { code } = await params;
  const { phone } = await searchParams;
  const digits = (phone ?? "").replace(/\D/g, "").slice(-10);

  if (!digits || digits.length < 10) {
    return (
      <main className="min-h-screen bg-transparent px-4 py-12">
        <PortalLookupForm initialCode={code} />
      </main>
    );
  }

  let session = null;
  let error: string | null = null;
  try {
    session = await openCustomerPortal({ portalCode: code, phone: digits });
  } catch (err) {
    error = err instanceof Error ? err.message : "Unable to open portal";
  }

  if (!session) {
    return (
      <main className="min-h-screen bg-transparent px-4 py-12 space-y-4">
        <p className="mx-auto max-w-md rounded-xl border border-[var(--error)] bg-white p-4 text-sm text-[var(--error)]">
          {error ?? "Invalid code or phone number"}
        </p>
        <PortalLookupForm initialCode={code} />
        <p className="text-center text-sm">
          <Link href="/portal" className="font-semibold text-[var(--primary)]">
            Try again
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent px-4 py-10">
      <PortalDashboard session={session} phone={digits} />
    </main>
  );
}
