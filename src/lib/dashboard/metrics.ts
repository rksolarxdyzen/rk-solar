/** Pure dashboard metric helpers (Phase 1). */

export type MonthRange = { start: Date; end: Date };

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function previousMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() - 1, 15);
}

export function monthRange(d: Date): MonthRange {
  return { start: startOfMonth(d), end: endOfMonth(d) };
}

export function daysAgoRange(days: number, now = new Date()): { start: Date; end: Date } {
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export function inRange(iso: string | null | undefined, range: { start: Date; end: Date }) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= range.start.getTime() && t <= range.end.getTime();
}

/**
 * % change from previous → current.
 * null when previous is 0 and current is 0; +100 when previous is 0 and current > 0.
 */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/**
 * Pipeline value (30d) rule:
 * For each customer/lead with ≥1 qualifying quote, use average grand_total
 * (exact amount if only one). Sum across customers.
 */
export function pipelineValueFromQuotes(
  quotes: Array<{ leadKey: string; amount: number }>
): number {
  const byLead = new Map<string, number[]>();
  for (const q of quotes) {
    if (!q.leadKey) continue;
    const amount = Number(q.amount);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const list = byLead.get(q.leadKey) ?? [];
    list.push(amount);
    byLead.set(q.leadKey, list);
  }

  let total = 0;
  for (const amounts of byLead.values()) {
    if (amounts.length === 0) continue;
    const sum = amounts.reduce((a, b) => a + b, 0);
    total += sum / amounts.length;
  }
  return Math.round(total * 100) / 100;
}

export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Self-check used by scripts / CI smoke — returns error messages (empty = pass). */
export function assertPipelineValueRules(): string[] {
  const errors: string[] = [];
  const one = pipelineValueFromQuotes([{ leadKey: "a", amount: 100000 }]);
  if (one !== 100000) errors.push(`single quote expected 100000 got ${one}`);

  const avg = pipelineValueFromQuotes([
    { leadKey: "a", amount: 100000 },
    { leadKey: "a", amount: 200000 },
  ]);
  if (avg !== 150000) errors.push(`avg expected 150000 got ${avg}`);

  const multi = pipelineValueFromQuotes([
    { leadKey: "a", amount: 100000 },
    { leadKey: "a", amount: 200000 },
    { leadKey: "b", amount: 50000 },
  ]);
  if (multi !== 200000) errors.push(`multi-lead expected 200000 got ${multi}`);

  const pct = percentChange(120, 100);
  if (pct !== 20) errors.push(`percentChange expected 20 got ${pct}`);

  return errors;
}
