import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import type { Profile } from "@/lib/domain/types";

export async function requireApiUser(): Promise<
  { ok: true; profile: Profile } | { ok: false; response: NextResponse }
> {
  const profile = await getCurrentUser();
  if (!profile || !profile.is_active) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Please sign in." }, { status: 401 }),
    };
  }
  return { ok: true, profile };
}

export function jsonError(error: unknown, fallback = "Request failed") {
  const message = error instanceof Error ? error.message : fallback;
  const status =
    message === "Unauthorized" || message.toLowerCase().includes("sign in")
      ? 401
      : 400;
  return NextResponse.json({ error: message }, { status });
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
