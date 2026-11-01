import { redirect } from "next/navigation";

/** Reminders tab removed (Phase 3a) — use Alerts drawer / /alerts. */
export default function RemindersRedirectPage() {
  redirect("/alerts");
}
