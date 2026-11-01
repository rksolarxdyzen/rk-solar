"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/brand";
import { cn } from "@/lib/utils";

export type PovUser = { id: string; name: string; role: string };

const ROLE_ON_LEAD = [
  ["any", "Any role on lead"],
  ["tele_call", "Tele-caller"],
  ["survey", "Surveyor"],
  ["assigned", "Assigned to"],
] as const;

/** Admin-only "View as" select. Writes `?as=` / `?as_role=` and drops the own-queue filter. */
export function ViewAsPicker({
  users,
  className,
}: {
  users: PovUser[];
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const as = searchParams.get("as") ?? "";
  const asRole = searchParams.get("as_role") ?? "any";

  if (users.length === 0) return null;

  function push(nextAs: string, nextRole: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextAs) {
      params.set("as", nextAs);
      params.delete("queue");
    } else {
      params.delete("as");
    }
    if (nextAs && nextAs !== "unassigned" && nextRole !== "any") {
      params.set("as_role", nextRole);
    } else {
      params.delete("as_role");
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const picked = users.find((u) => u.id === as);
  const active = Boolean(as);
  const onCustomers = pathname.startsWith("/customers");
  const otherPath = onCustomers ? "/pipeline" : "/customers";
  const otherLabel = onCustomers ? "Pipeline" : "Customers";
  const povParams = new URLSearchParams();
  if (as) povParams.set("as", as);
  if (as && searchParams.get("as_role")) povParams.set("as_role", asRole);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Select
        value={as}
        onChange={(e) => push(e.target.value, asRole)}
        className={cn(
          "w-auto max-w-[15rem]",
          active && "border-[var(--primary)] text-[var(--primary)]"
        )}
        aria-label="View as"
      >
        <option value="">View as: Everyone</option>
        <option value="unassigned">Unassigned leads</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} · {ROLE_LABELS[u.role] ?? u.role}
          </option>
        ))}
      </Select>
      {picked && (
        <Select
          value={asRole}
          onChange={(e) => push(as, e.target.value)}
          className="w-auto"
          aria-label="Role on lead"
        >
          {ROLE_ON_LEAD.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      )}
      {active && (
        <button
          type="button"
          onClick={() => push("", "any")}
          className="rounded-full border border-[var(--primary)] bg-[var(--primary-light)] px-2.5 py-1 text-xs font-semibold text-[var(--primary)]"
        >
          {picked ? picked.name : "Unassigned"} ×
        </button>
      )}
      {active && (
        <Link
          href={`${otherPath}?${povParams.toString()}`}
          className="text-xs font-semibold text-[var(--primary)] hover:underline"
        >
          Same view in {otherLabel} →
        </Link>
      )}
    </div>
  );
}
