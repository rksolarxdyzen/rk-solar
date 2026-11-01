/** IST (Asia/Kolkata) day helpers for evening reports. */

export const REPORT_TZ = "Asia/Kolkata";

export type DayWindow = {
  /** YYYY-MM-DD in IST */
  dateKey: string;
  start: Date;
  end: Date;
  label: string;
};

export function istDayWindow(now = new Date()): DayWindow {
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: REPORT_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const start = new Date(`${dateKey}T00:00:00+05:30`);
  const end = new Date(`${dateKey}T23:59:59.999+05:30`);
  const label = new Intl.DateTimeFormat("en-IN", {
    timeZone: REPORT_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);

  return { dateKey, start, end, label };
}

export function inWindow(iso: string | null | undefined, window: DayWindow) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= window.start.getTime() && t <= window.end.getTime();
}
