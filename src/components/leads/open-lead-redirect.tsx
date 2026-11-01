"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLeadModal } from "@/components/leads/lead-modal-context";

/** Redirects /leads/[id] to pipeline and opens the lead modal */
export function OpenLeadRedirect({ leadId }: { leadId: string }) {
  const { openLead } = useLeadModal();
  const router = useRouter();

  useEffect(() => {
    openLead(leadId);
    router.replace("/pipeline");
  }, [leadId, openLead, router]);

  return null;
}
