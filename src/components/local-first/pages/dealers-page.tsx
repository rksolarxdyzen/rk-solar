"use client";

import { useQuery } from "@tanstack/react-query";
import {
  dealerCommissionCapabilities,
  listDealerDirectory,
} from "@/actions/dealers";
import { DealersWorkspace } from "@/components/dealers/dealers-workspace";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";

export default function DealersPage() {
  const { profile, companyId } = useLocalFirstSession();

  const capsQ = useQuery({
    queryKey: ["rk", "dealer-caps", companyId, profile.id] as const,
    queryFn: () => dealerCommissionCapabilities(profile),
  });

  const dealersQ = useQuery({
    queryKey: ["rk", "dealers", companyId] as const,
    queryFn: () => listDealerDirectory(),
    enabled: Boolean(capsQ.data?.canViewDirectory),
    retry: false,
  });

  if (capsQ.isPending && !capsQ.data) {
    return <div className="min-h-[40vh]" aria-busy="true" />;
  }

  if (!capsQ.data?.canViewDirectory) {
    return (
      <p className="rounded-xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--text-muted)]">
        You do not have access to the dealers directory.
      </p>
    );
  }

  if (dealersQ.isError) {
    const message =
      dealersQ.error instanceof Error
        ? dealersQ.error.message
        : String(dealersQ.error);
    if (
      message.includes("027") ||
      message.includes("028") ||
      message.includes("dealer") ||
      message.includes("schema cache") ||
      message.includes("does not exist")
    ) {
      return (
        <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error-light)] p-6 text-sm text-[var(--text-dark)]">
          <p className="font-semibold">Dealers schema not applied</p>
          <p className="mt-2 text-[var(--text-body)]">{message}</p>
        </div>
      );
    }
  }

  return (
    <DealersWorkspace
      dealers={dealersQ.data ?? []}
      canApprove={capsQ.data.canApprove}
    />
  );
}
