import { redirect } from "next/navigation";

/** Alias: Leads → pipeline board. */
export default function LeadsAliasPage() {
  redirect("/pipeline");
}
