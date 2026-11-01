import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  let url: string;
  let anonKey: string;
  try {
    ({ url, anonKey } = getSupabaseEnv());
  } catch {
    if (
      request.nextUrl.pathname.startsWith("/login") ||
      request.nextUrl.pathname.startsWith("/r/") ||
      request.nextUrl.pathname.startsWith("/portal") ||
      request.nextUrl.pathname.startsWith("/api/ingest/") ||
      request.nextUrl.pathname.startsWith("/api/cron/")
    ) {
      return supabaseResponse;
    }
    return new NextResponse(
      "Server misconfiguration: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      { status: 503 }
    );
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith("/login");
  const isAuthCallback = path.startsWith("/auth/");
  const isPublicReferral = path.startsWith("/r/");
  const isPublicPortal = path.startsWith("/portal");
  const isIngestApi = path.startsWith("/api/ingest/");
  const isCronApi = path.startsWith("/api/cron/");
  const isPwaAsset =
    path === "/manifest.webmanifest" ||
    path === "/sw.js" ||
    path === "/sw-rks.js" ||
    path === "/favicon.ico" ||
    path === "/favicon-48.png" ||
    path.startsWith("/brand/icon-") ||
    path === "/brand/apple-touch-icon.png";
  const isPublic =
    isAuthPage ||
    isAuthCallback ||
    isPublicReferral ||
    isPublicPortal ||
    isIngestApi ||
    isCronApi ||
    isPwaAsset;

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
