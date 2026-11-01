export function inr(v: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(v);
}

export function shortINR(v: number) {
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`;
  return `₹${v.toLocaleString("en-IN")}`;
}

export function customerName(
  rel: { name?: string; phone?: string } | { name?: string; phone?: string }[] | null | undefined
) {
  if (!rel) return "—";
  if (Array.isArray(rel)) return rel[0]?.name ?? "—";
  return rel.name ?? "—";
}

export function customerPhone(
  rel: { phone?: string } | { phone?: string }[] | null | undefined,
  formatted = false
) {
  if (!rel) return formatted ? undefined : "—";
  const phone = Array.isArray(rel) ? rel[0]?.phone : rel.phone;
  if (!phone) return formatted ? undefined : "—";
  if (formatted) return phone.replace(/[^0-9]/g, "");
  return phone;
}
