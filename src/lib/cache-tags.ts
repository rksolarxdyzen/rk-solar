import { revalidatePath, revalidateTag } from "next/cache";

/** Shared invalidation tags for CRM list pages. */
export const CACHE_TAGS = {
  leads: "leads",
  reminders: "reminders",
  quotations: "quotations",
  files: "files",
  reports: "reports",
  catalog: "catalog",
  inventory: "inventory",
} as const;

function bustTag(tag: string) {
  revalidateTag(tag, "max");
}

export function revalidateInventory(opts?: { itemIds?: string[]; leadId?: string | null }) {
  bustTag(CACHE_TAGS.inventory);
  revalidatePath("/inventory", "layout");
  for (const id of opts?.itemIds ?? []) revalidatePath(`/inventory/items/${id}`);
  if (opts?.leadId) {
    revalidatePath(`/customers`);
    revalidatePath(`/leads/${opts.leadId}`);
  }
}
