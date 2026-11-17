"use server";

import { redirect } from "next/navigation";
import { canViewAdSubmissions } from "@/lib/ads/access";
import { getUserAuthorities } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function signInAds(formData: FormData): Promise<{ error: string } | void> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

  if (authError) {
    return { error: authError.message };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sign in failed. Please try again." };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    await supabase.auth.signOut();
    return { error: `Could not load your profile: ${profileError.message}` };
  }

  if (!profile) {
    await supabase.auth.signOut();
    return { error: "No profile exists for this account." };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { error: "Your account is deactivated. Contact your administrator." };
  }

  const authorities = await getUserAuthorities(profile.id);
  if (!canViewAdSubmissions(authorities)) {
    await supabase.auth.signOut();
    return { error: "This account cannot open ad enquiries. Ask an admin for access." };
  }

  redirect("/ads");
}

export async function signOutAds() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/ads/login");
}
