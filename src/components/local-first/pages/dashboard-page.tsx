"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { dashboardOptions } from "@/lib/local-first/queries";

export default function DashboardPage() {
  const { companyId } = useLocalFirstSession();
  const router = useRouter();
  const { data, isPending, isFetched } = useQuery(dashboardOptions(companyId));

  // Only leave after a settled fetch that proves the session is gone — not on
  // a transient SoftLink mount error (that sent users to /login mid-nav).
  useEffect(() => {
    if (isFetched && data === null) router.replace("/login");
  }, [data, isFetched, router]);

  if (isPending && !data) {
    return (
      <div className="min-h-[40vh]" aria-busy="true" aria-label="Loading dashboard" />
    );
  }
  if (!data) return null;
  return <DashboardHome data={data} />;
}
