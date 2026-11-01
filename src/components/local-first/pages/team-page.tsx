"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TeamAccessManager } from "@/components/admin/team-access-manager";
import { useLocalFirstSession } from "@/components/local-first/local-first-session";
import { hasAuth, roleIn } from "@/lib/local-first/access";
import { teamOptions } from "@/lib/local-first/queries";

export default function TeamPage() {
  const { profile, authorities, companyId } = useLocalFirstSession();
  const router = useRouter();
  const can =
    roleIn(profile, ["admin"]) ||
    hasAuth(authorities, "manage_users") ||
    hasAuth(authorities, "manage_roles");

  const { data, isPending } = useQuery({
    ...teamOptions(companyId),
    enabled: can,
  });

  useEffect(() => {
    if (!can) router.replace("/");
  }, [can, router]);

  if (!can) return null;
  if (isPending && !data) {
    return <div className="min-h-[40vh]" aria-busy="true" />;
  }
  if (!data) return null;
  return <TeamAccessManager data={data} />;
}
