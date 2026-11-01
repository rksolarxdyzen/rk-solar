"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  listReferralLinks,
  listRecentIngestEvents,
  getLeadSourceStats,
} from "@/actions/ingest";
import {
  StaffReferralForm,
  ReferralLinksPanel,
  IngestEventsTable,
} from "@/components/leads/ingest-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { hasAuth, roleIn } from "@/lib/local-first/access";

export default function IngestPage() {
  const { profile, authorities, companyId } = useLocalFirstSession();
  const router = useRouter();
  const can =
    roleIn(profile, ["admin", "sales_manager"]) ||
    hasAuth(authorities, "import_leads") ||
    hasAuth(authorities, "add_edit_leads");
  const canImport =
    roleIn(profile, ["admin", "sales_manager"]) ||
    hasAuth(authorities, "import_leads");

  const dataQ = useQuery({
    queryKey: ["rk", "ingest", companyId] as const,
    queryFn: async () => {
      const [links, events, sources] = await Promise.all([
        canImport ? listReferralLinks().catch(() => []) : Promise.resolve([]),
        canImport
          ? listRecentIngestEvents().catch(() => [])
          : Promise.resolve([]),
        getLeadSourceStats().catch(() => []),
      ]);
      return { links, events, sources };
    },
    enabled: can,
  });

  useEffect(() => {
    if (!can) router.replace("/pipeline");
  }, [can, router]);

  if (!can) return null;

  const links = dataQ.data?.links ?? [];
  const events = dataQ.data?.events ?? [];
  const sources = dataQ.data?.sources ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Ingest"
        subtitle="Referral forms, Facebook Lead Ads webhook, and source mix."
        className="mb-0"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <StaffReferralForm />
        {canImport && <ReferralLinksPanel links={links} />}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold text-[var(--text-dark)]">
          Facebook Lead Ads
        </h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Webhook URL:{" "}
          <code className="text-[var(--primary)]">/api/ingest/facebook</code>
        </p>
      </div>

      {sources.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-dark)]">
            Source analytics
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((s) => (
              <div
                key={s.source}
                className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {s.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--text-dark)]">
                  {s.total}
                </p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Active {s.active} · Lost {s.lost} · Survey done{" "}
                  {s.surveyCompleted}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {canImport && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-dark)]">
            Recent ingest events
          </h2>
          <IngestEventsTable events={events} />
        </div>
      )}
    </div>
  );
}
