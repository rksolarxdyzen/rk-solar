export type ActionOk<T> = { ok: true } & T;
export type ActionFail = { ok: false; error: string };
export type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  | ActionOk<T>
  | ActionFail;

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) {
    const msg = err.message;
    if (msg.includes("Server Components render") || msg.includes("digest")) {
      return fallback;
    }
    return msg;
  }
  if (typeof err === "object" && err && "message" in err) {
    const msg = String((err as { message: unknown }).message ?? "");
    if (msg) return msg;
  }
  return fallback;
}

export function dbErrorMessage(
  error: { message?: string; code?: string; details?: string } | null,
  fallback: string
): string {
  if (!error) return fallback;
  const blob = `${error.message ?? ""} ${error.details ?? ""} ${error.code ?? ""}`;
  if (/row-level security|42501/i.test(blob)) {
    return "Upload blocked by database security policy. Ask an admin to run the attachments RLS SQL in Supabase.";
  }
  return [error.message, error.details, error.code ? `(${error.code})` : null]
    .filter(Boolean)
    .join(" — ") || fallback;
}
