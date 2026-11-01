"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  InstallationQueueList,
  type InstallationQueueRow,
} from "@/components/leads/installation-queue-list";
import { PageHeader } from "@/components/layout/page-header";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { hasAuth, roleIn } from "@/lib/local-first/access";
import { installationOptions } from "@/lib/local-first/queries";

export default function InstallationPage() {
  const { profile, authorities, companyId } = useLocalFirstSession();
  const router = useRouter();
  const can =
    roleIn(profile, [
      "admin",
      "ops_coordinator",
      "installation_crew",
      "sales_manager",
    ]) ||
    hasAuth(authorities, "view_installation_queue") ||
    hasAuth(authorities, "assign_installation_crew") ||
    hasAuth(authorities, "upload_installation_proofs");

  const { data = [], isPending } = useQuery(installationOptions(companyId));

  useEffect(() => {
    if (!can) router.replace("/pipeline");
  }, [can, router]);

  const rows: InstallationQueueRow[] = useMemo(
    () =>
      data.map((row) => {
        const crew = Array.isArray(row.crew) ? row.crew[0] : row.crew;
        return {
          id: row.id,
          name: row.name,
          phone: row.phone,
          city: row.city,
          sales_stage: row.sales_stage,
          expected_panel_count: row.expected_panel_count,
          installation_assigned_at: row.installation_assigned_at,
          assigned_crew_id: row.assigned_crew_id,
          crewName: (crew as { name?: string } | null)?.name ?? null,
        };
      }),
    [data]
  );

  if (!can) return null;
  if (isPending && data.length === 0) {
    return (
      <div
        className="min-h-[40vh]"
        aria-busy="true"
        aria-label="Loading installation"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Ops"
        title="Installation"
        subtitle={
          profile.role === "installation_crew"
            ? "Your assigned jobs"
            : "Assign crew and track installation proofs"
        }
        className="mb-0"
      />
      <InstallationQueueList
        rows={rows}
        crewView={profile.role === "installation_crew"}
      />
    </div>
  );
}
