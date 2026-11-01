export type ReceivablesBucket =
  | "all"
  | "pending"
  | "paid"
  | "token"
  | "pre"
  | "final"
  | "subsidy";

const BUCKETS: ReceivablesBucket[] = ["all", "pending", "paid", "token", "pre", "final", "subsidy"];

export function parseReceivablesBucket(value: string | undefined): ReceivablesBucket {
  return BUCKETS.includes(value as ReceivablesBucket) ? (value as ReceivablesBucket) : "all";
}

export function receivablesHref(bucket: ReceivablesBucket): string {
  return bucket === "all" ? "/accounts/receivables" : `/accounts/receivables?bucket=${bucket}`;
}
