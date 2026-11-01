import type { QueryClient } from "@tanstack/react-query";

/** Invalidate CRM list caches after a successful mutation. */
export function invalidateRkLists(
  queryClient: QueryClient,
  scopes: Array<
    | "dashboard"
    | "pipeline"
    | "customers"
    | "quotations"
    | "payments"
    | "installation"
    | "liaison"
    | "dealers"
    | "receivables"
    | "maintenance"
    | "grievances"
    | "all"
  > = ["all"]
) {
  if (scopes.includes("all")) {
    void queryClient.invalidateQueries({ queryKey: ["rk"] });
    return;
  }
  for (const scope of scopes) {
    void queryClient.invalidateQueries({ queryKey: ["rk", scope] });
  }
  // List mutations often change a lead row — refresh modal detail caches too.
  if (
    scopes.includes("pipeline") ||
    scopes.includes("customers") ||
    scopes.includes("installation") ||
    scopes.includes("liaison") ||
    scopes.includes("payments")
  ) {
    void queryClient.invalidateQueries({ queryKey: ["rk", "lead"] });
  }
  if (scopes.includes("quotations")) {
    void queryClient.invalidateQueries({ queryKey: ["rk", "quotation"] });
  }
}
