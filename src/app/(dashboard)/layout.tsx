import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getUserAuthorities } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { QueryProvider } from "@/components/local-first/query-provider";
import { LocalFirstSessionProvider } from "@/components/local-first/local-first-session";
import {
  RkClientNavProvider,
  RkClientOutlet,
} from "@/components/local-first/rk-client-nav";
import type { AuthorityKey } from "@/lib/domain/authorities";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getCurrentUser();
  if (!profile) redirect("/login?error=profile_missing");

  const authSet = await getUserAuthorities(profile.id);
  const authorities = Array.from(authSet) as AuthorityKey[];

  // Plain JSON props only — never pass the raw Supabase row object.
  const sessionProfile = {
    id: profile.id,
    company_id: profile.company_id,
    name: profile.name,
    email: profile.email ?? null,
    phone: profile.phone,
    role: profile.role,
    role_id: profile.role_id ?? null,
    is_active: profile.is_active,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };

  return (
    <QueryProvider companyId={sessionProfile.company_id} userId={sessionProfile.id}>
      <LocalFirstSessionProvider
        profile={sessionProfile}
        authorities={authorities}
      >
        <RkClientNavProvider>
          <AppShell profile={sessionProfile} authorities={authorities}>
            <RkClientOutlet>{children}</RkClientOutlet>
          </AppShell>
        </RkClientNavProvider>
      </LocalFirstSessionProvider>
    </QueryProvider>
  );
}
