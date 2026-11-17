import { Suspense } from "react";
import { redirect } from "next/navigation";
import { signOutAds } from "@/actions/ads-auth";
import { listAdSubmissions } from "@/actions/ads-inbox";
import { AdsInboxFilters } from "@/components/ads/inbox-filters";
import { AdsInboxTable } from "@/components/ads/inbox-table";
import { canViewAdSubmissions } from "@/lib/ads/access";
import { getSession } from "@/lib/auth";
import { BRAND } from "@/lib/brand";

export default async function AdsInboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/ads/login");
  if (!canViewAdSubmissions(session.authorities)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-5">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-red-700">
            Access denied
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Your account does not have permission to view ad enquiries.
          </p>
          <form action={signOutAds} className="mt-6">
            <button
              type="submit"
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    );
  }

  const params = await searchParams;
  const filters = {
    q: typeof params.q === "string" ? params.q : undefined,
    status: typeof params.status === "string" ? params.status : undefined,
    from: typeof params.from === "string" ? params.from : undefined,
    to: typeof params.to === "string" ? params.to : undefined,
  };
  const rows = await listAdSubmissions(filters);

  return (
    <div className="min-h-screen bg-[#f7f9fc]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#3158a6]">
              Ad enquiries
            </p>
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[#1e3970]">
              {BRAND.name}
            </h1>
          </div>
          <form action={signOutAds}>
            <button
              type="submit"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-4 px-5 py-6 sm:px-8">
        <Suspense fallback={null}>
          <AdsInboxFilters />
        </Suspense>
        <p className="text-sm text-slate-500">
          {rows.length} submission{rows.length === 1 ? "" : "s"}
        </p>
        <AdsInboxTable rows={rows} />
      </main>
    </div>
  );
}
