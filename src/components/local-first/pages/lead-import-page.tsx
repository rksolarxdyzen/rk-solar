"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LeadImportWorkspace } from "@/components/leads/lead-import-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { hasAuth } from "@/lib/local-first/access";

export default function LeadImportPage() {
  const { authorities } = useLocalFirstSession();
  const router = useRouter();
  const canImport = hasAuth(authorities, "import_leads");
  const canDistribute = hasAuth(authorities, "distribute_leads");

  useEffect(() => {
    if (!canImport && !canDistribute) router.replace("/");
  }, [canImport, canDistribute, router]);

  if (!canImport && !canDistribute) return null;

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Import"
        subtitle="Upload Excel enquiries and distribute them to the tele-calling team."
      />
      <LeadImportWorkspace canImport={canImport} canDistribute={canDistribute} />
    </div>
  );
}
