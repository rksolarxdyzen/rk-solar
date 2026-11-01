import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Skip Next internals, static assets, and PWA files.
     * Manifest + service worker MUST stay public — otherwise Chrome redirects
     * them to /login and never offers Install.
     */
    "/((?!_next/static|_next/image|favicon.ico|favicon-48\\.png|manifest\\.webmanifest|sw\\.js|sw-rks\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};
