"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData): Promise<{ error: string } | void> {
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
    return {
      error:
        "No profile exists for this account. Run the Phase 0 migration and create the user with company metadata, or insert a profiles row.",
    };
  }

  if (!profile.is_active) {
    await supabase.auth.signOut();
    return { error: "Your account is deactivated. Contact your administrator." };
  }

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
