"use client";

import { useQuery } from "@tanstack/react-query";
import {
  grievanceCapabilities,
  listGrievanceAssignees,
  listGrievances,
} from "@/actions/grievances";
import {
  GrievancesWorkspace,
  type GrievanceRow,
} from "@/components/grievances/grievances-workspace";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";

export default function GrievancesPage() {
  const { profile, companyId } = useLocalFirstSession();

  const capsQ = useQuery({
    queryKey: ["rk", "grievance-caps", companyId, profile.id] as const,
    queryFn: () => grievanceCapabilities(profile),
  });

  const listQ = useQuery({
    queryKey: ["rk", "grievances", companyId] as const,
    queryFn: async () => {
      const [grievances, staff] = await Promise.all([
        listGrievances(),
        listGrievanceAssignees(),
      ]);
      return { grievances: grievances as GrievanceRow[], staff };
    },
    enabled: Boolean(capsQ.data?.canView),
    retry: false,
  });

  if (capsQ.isPending && !capsQ.data) {
    return <div className="min-h-[40vh]" aria-busy="true" />;
  }

  if (!capsQ.data?.canView) {
    return (
      <p className="rounded-xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--text-muted)]">
        You do not have access to grievances.
      </p>
    );
  }

  if (listQ.isError) {
    const message =
      listQ.error instanceof Error ? listQ.error.message : String(listQ.error);
    if (
      message.includes("grievances") ||
      message.includes("schema cache") ||
      message.includes("does not exist")
    ) {
      return (
        <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error-light)] p-6 text-sm text-[var(--text-dark)]">
          <p className="font-semibold">Grievances schema not applied</p>
          <p className="mt-2 text-[var(--text-body)]">
            Run Supabase migration{" "}
            <code className="rounded bg-white px-1.5 py-0.5 text-xs">
              026_grievances.sql
            </code>{" "}
            in the SQL editor, then refresh this page.
          </p>
        </div>
      );
    }
  }

  return (
    <GrievancesWorkspace
      grievances={listQ.data?.grievances ?? []}
      staff={listQ.data?.staff ?? []}
      profileId={profile.id}
      canRaise={capsQ.data.canRaise}
      canManage={capsQ.data.canManage}
    />
  );
}
