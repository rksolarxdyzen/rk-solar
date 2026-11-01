"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getQuotationContext } from "@/lib/quotations/context";

const leadCustomerSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  city: z.string().optional(),
});

export type QuotationCustomer = {
  id: string;
  name: string;
  phone: string;
  address?: string | null;
};

/**
 * Creates a CRM lead to use as a quotation customer. Scoped to the caller's
 * company and gated on manage_quotations authority.
 */
export async function createQuotationCustomer(input: unknown): Promise<QuotationCustomer> {
  const data = leadCustomerSchema.parse(input);
  const { supabase, userId, companyId, canManageQuotations } = await getQuotationContext();
  if (!canManageQuotations) throw new Error("You do not have permission to add customers.");

  const { data: lead, error } = await supabase
    .from("leads")
    .insert({
      company_id: companyId,
      name: data.name,
      phone: data.phone,
      email: data.email || null,
      address: data.address || null,
      city: data.city || null,
      temperature: "cold",
      source: "other",
      assigned_to: userId,
      created_by: userId,
    })
    .select("id,name,phone,address")
    .single();

  if (error) throw new Error(error.message);

  revalidatePath("/quotations");
  return { id: lead.id, name: lead.name, phone: lead.phone, address: lead.address };
}
