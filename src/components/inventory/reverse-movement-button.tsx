"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { reverseMovement } from "@/actions/inventory";

export function ReverseMovementButton({ movementId, movementNo }: { movementId: string; movementNo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await reverseMovement({ movement_id: movementId, reason });
      if (!res.ok) return setError(res.error);
      setOpen(false);
      router.push(`/inventory/movements/${res.movement.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" className="min-h-[44px]" onClick={() => setOpen(true)}>
        <Undo2 className="h-4 w-4" /> Reverse
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Reverse ${movementNo}`} subtitle="Creates a reversal entry that undoes this movement. Nothing is deleted.">
        <div className="space-y-3">
          <div>
            <Label htmlFor="rv-reason">Reason</Label>
            <Textarea id="rv-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong customer, entered twice…" />
          </div>
          {error && <p className="text-sm font-medium text-[var(--error)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={pending || reason.trim().length < 3}>
              {pending ? "Reversing…" : "Reverse entry"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
