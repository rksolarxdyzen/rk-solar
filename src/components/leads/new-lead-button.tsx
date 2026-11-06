"use client";

import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { createLead, getAssignmentOptions } from "@/actions/leads";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { LEAD_SOURCES, LEAD_SOURCE_LABELS } from "@/lib/domain/workflow";
import { useRkRefresh } from "@/lib/local-first/use-rk-refresh";
import { Plus } from "lucide-react";

export function NewLeadButton({
  variant = "primary",
}: {
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [canAssign, setCanAssign] = useState(false);
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const rkRefresh = useRkRefresh();
  const { openLead } = useLeadModal();

  useEffect(() => {
    if (!open) return;
    setError(null);
    let cancelled = false;
    getAssignmentOptions()
      .then((opts) => {
        if (cancelled) return;
        setCanAssign(opts.canAssign);
        setEmployees(opts.employees);
        setCurrentUserId(opts.currentUserId);
        setAssigneeId(opts.currentUserId);
      })
      .catch(() => {
        if (!cancelled) {
          setCanAssign(false);
          setEmployees([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const phoneDigits = String(fd.get("phone") ?? "").replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const lead = await createLead({
          name: fd.get("name") as string,
          phone: fd.get("phone") as string,
          email: (fd.get("email") as string) || "",
          city: (fd.get("city") as string) || undefined,
          address: (fd.get("address") as string) || undefined,
          requirement_notes: (fd.get("requirement_notes") as string) || undefined,
          temperature: (fd.get("temperature") as "hot" | "warm" | "cold") || "warm",
          source: (fd.get("source") as "manual") || "manual",
          assigned_to: canAssign && assigneeId ? assigneeId : undefined,
        });
        setOpen(false);
        rkRefresh(["pipeline", "dashboard"]);
        openLead(lead.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create lead");
      }
    });
  }

  return (
    <>
      <Button type="button" variant={variant} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> New Lead
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New Lead"
        subtitle="Capture enquiry for RK Bhabhor"
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Customer name *</Label>
              <Input name="name" required minLength={2} placeholder="Full name" autoFocus />
            </div>
            <div>
              <Label>Phone *</Label>
              <Input
                name="phone"
                required
                minLength={10}
                maxLength={15}
                placeholder="10-digit mobile"
                inputMode="tel"
                title="Enter a 10-digit mobile number"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>City</Label>
              <Input name="city" placeholder="City" />
            </div>
            <div>
              <Label>Priority</Label>
              <Select name="temperature" defaultValue="warm">
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cold">Cold</option>
              </Select>
            </div>
            <div>
              <Label>Source</Label>
              <Select name="source" defaultValue="manual">
                {LEAD_SOURCES.filter((s) => s !== "excel_import").map((s) => (
                  <option key={s} value={s}>
                    {LEAD_SOURCE_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {canAssign && employees.length > 0 && (
            <div>
              <Label>Assign to</Label>
              <Select
                value={assigneeId || currentUserId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                    {employee.id === currentUserId ? " (me)" : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label>Address</Label>
            <Input name="address" placeholder="Site address" />
          </div>
          <div>
            <Label>Email</Label>
            <Input name="email" type="email" placeholder="optional" />
          </div>
          <div>
            <Label>Requirement notes</Label>
            <Textarea name="requirement_notes" placeholder="System size, roof type…" rows={3} />
          </div>
          {error && <p className="text-sm text-[var(--error)]">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Create lead"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
