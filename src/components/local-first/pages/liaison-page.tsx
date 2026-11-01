"use client";

import { Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { listPreInstallFeasibilityQueue } from "@/actions/feasibility";
import { listLiaisonQueue } from "@/actions/liaison";
import { LiaisonWorkspace } from "@/components/liaison/liaison-workspace";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { hasAuth, roleIn } from "@/lib/local-first/access";

function LiaisonInner() {
  const { profile, authorities, companyId } = useLocalFirstSession();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");

  const canLiaison =
    roleIn(profile, ["admin", "liaison", "sales_manager"]) ||
    hasAuth(authorities, "manage_liaison");
  const canUploadFeasibility =
    roleIn(profile, ["admin", "feasibility", "liaison", "sales_manager"]) ||
    hasAuth(authorities, "upload_feasibility_report") ||
    hasAuth(authorities, "manage_liaison");
  const canVerify =
    roleIn(profile, ["admin", "accounts"]) ||
    hasAuth(authorities, "verify_subsidy");
  const canSubmitCommission =
    roleIn(profile, ["admin", "sales_manager", "accounts", "dealer"]) ||
    hasAuth(authorities, "submit_dealer_commission");
  const canApproveCommission =
    roleIn(profile, ["admin", "sales_manager", "accounts"]) ||
    hasAuth(authorities, "approve_dealer_commission");
  const canAssignDealer =
    roleIn(profile, ["admin", "sales_manager"]) ||
    hasAuth(authorities, "assign_dealer");

  const liaisonQ = useQuery({
    queryKey: ["rk", "liaison", companyId] as const,
    queryFn: () => listLiaisonQueue(),
    enabled: canLiaison || canVerify,
  });
  const preInstallQ = useQuery({
    queryKey: ["rk", "liaison-preinstall", companyId] as const,
    queryFn: () => listPreInstallFeasibilityQueue(),
    enabled: canUploadFeasibility || canLiaison,
  });

  if (!canLiaison && !canVerify && !canUploadFeasibility) {
    return (
      <p className="rounded-xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--text-muted)]">
        You do not have access to Documentation.
      </p>
    );
  }

  return (
    <LiaisonWorkspace
      leads={liaisonQ.data ?? []}
      preInstallLeads={preInstallQ.data ?? []}
      initialTab={tab === "pre-install" ? "pre-install" : "post-install"}
      canLiaison={canLiaison}
      canVerifySubsidy={canVerify}
      canUploadFeasibility={canUploadFeasibility}
      canSubmitCommission={canSubmitCommission}
      canApproveCommission={canApproveCommission}
      canAssignDealer={canAssignDealer}
    />
  );
}

export default function LiaisonPage() {
  return (
    <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}>
      <LiaisonInner />
    </Suspense>
  );
}
