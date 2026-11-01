"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteLead } from "@/actions/leads";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function DeleteLeadButton({
  leadId,
  leadName,
  kind = "lead",
}: {
  leadId: string;
  leadName: string;
  kind?: "lead" | "customer";
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { closeLead } = useLeadModal();
  const router = useRouter();
  const noun = kind === "customer" ? "customer" : "lead";

  function confirm() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteLead(leadId);
        setOpen(false);
        closeLead();
        router.push(kind === "customer" ? "/customers" : "/pipeline");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not delete this ${noun}`);
      }
    });
  }

  return (
    <>
      <Button type="button" size="sm" variant="danger" onClick={() => setOpen(true)}>
        <Trash2 className="h-3.5 w-3.5" />
        Delete permanently
      </Button>
      <Modal
        open={open}
        onClose={() => !pending && setOpen(false)}
        title={`Delete ${noun} permanently?`}
        subtitle="Complete removal — for demo / test files too. Cannot be undone."
        layer="nested"
      >
        <p className="text-sm text-[var(--text-body)]">
          Permanently remove <span className="font-semibold">{leadName}</span> and all related
          records: quotations, calls, survey, payments, install photos, portal docs, and
          tickets. Use this to clear demo leads created during survey or installation.
        </p>
        {error && <p className="mt-3 text-sm text-[var(--error)]">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
            Back
          </Button>
          <Button type="button" variant="danger" disabled={pending} onClick={confirm}>
            {pending ? "Deleting…" : "Delete permanently"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
