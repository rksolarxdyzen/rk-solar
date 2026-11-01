"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { createStaffReferralLead, createReferralLink } from "@/actions/ingest";
import { formatDateTime } from "@/lib/utils";

export function StaffReferralForm({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  return (
    <form
      className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        setOk(null);
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          try {
            const result = await createStaffReferralLead({
              name: String(fd.get("name") ?? ""),
              phone: String(fd.get("phone") ?? ""),
              email: String(fd.get("email") ?? ""),
              city: String(fd.get("city") ?? ""),
              address: String(fd.get("address") ?? ""),
              requirement: String(fd.get("requirement") ?? ""),
              referrerName: String(fd.get("referrerName") ?? ""),
              referrerPhone: String(fd.get("referrerPhone") ?? ""),
            });
            setOk(
              result.status === "duplicate"
                ? "Lead already existed (duplicate)."
                : "Referral lead created."
            );
            (e.target as HTMLFormElement).reset();
            router.refresh();
            onDone?.();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Failed");
          }
        });
      }}
    >
      <h3 className="text-sm font-semibold text-[var(--text-dark)]">Staff referral entry</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Customer name</Label>
          <Input name="name" required />
        </div>
        <div>
          <Label>Phone</Label>
          <Input name="phone" required />
        </div>
        <div>
          <Label>Referrer name</Label>
          <Input name="referrerName" />
        </div>
        <div>
          <Label>Referrer phone</Label>
          <Input name="referrerPhone" />
        </div>
        <div className="sm:col-span-2">
          <Label>Requirement</Label>
          <Textarea name="requirement" rows={2} />
        </div>
      </div>
      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {ok && <p className="text-sm text-[var(--success)]">{ok}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Create referral lead"}
      </Button>
    </form>
  );
}

export function ReferralLinksPanel({
  links,
}: {
  links: Array<{ id: string; code: string; label: string | null; url: string; is_active: boolean }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
      <h3 className="text-sm font-semibold text-[var(--text-dark)]">Public referral links</h3>
      <p className="text-xs text-[var(--text-muted)]">
        Share <code className="text-[var(--primary)]">/r/&#123;code&#125;</code> — default seed:{" "}
        <code>/r/kt-default</code>
      </p>
      <ul className="space-y-2 text-sm">
        {links.map((l) => (
          <li
            key={l.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border-light)] px-3 py-2"
          >
            <div>
              <p className="font-medium text-[var(--text-dark)]">{l.label || l.code}</p>
              <p className="text-xs text-[var(--text-muted)]">{l.url || `/r/${l.code}`}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(l.url || `${window.location.origin}/r/${l.code}`);
                setMessage(`Copied ${l.code}`);
              }}
            >
              Copy
            </Button>
          </li>
        ))}
        {links.length === 0 && (
          <li className="text-xs text-[var(--text-muted)]">No links yet — create one below.</li>
        )}
      </ul>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Partner campaign)"
        />
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Optional code"
        />
      </div>
      {message && <p className="text-xs text-[var(--success)]">{message}</p>}
      <Button
        type="button"
        size="sm"
        disabled={pending || !label.trim()}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            try {
              const created = await createReferralLink(label, code || undefined);
              setMessage(`Created ${created.url}`);
              setLabel("");
              setCode("");
              router.refresh();
            } catch (err) {
              setMessage(err instanceof Error ? err.message : "Failed");
            }
          });
        }}
      >
        {pending ? "Creating…" : "New link"}
      </Button>
    </div>
  );
}

export function IngestEventsTable({
  events,
}: {
  events: Array<{
    id: string;
    channel: string;
    external_id: string | null;
    status: string;
    error_message: string | null;
    lead_id: string | null;
    created_at: string;
  }>;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
          <tr>
            <th className="px-3 py-2">When</th>
            <th className="px-3 py-2">Channel</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">External ID</th>
            <th className="px-3 py-2">Lead</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id} className="border-b border-[var(--border-light)]">
              <td className="px-3 py-2 whitespace-nowrap text-[var(--text-muted)]">
                {formatDateTime(e.created_at)}
              </td>
              <td className="px-3 py-2">{e.channel}</td>
              <td className="px-3 py-2">{e.status}</td>
              <td className="px-3 py-2 font-mono text-xs">{e.external_id ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs text-[var(--text-muted)]">
                {e.lead_id ? `${e.lead_id.slice(0, 8)}…` : "—"}
              </td>
            </tr>
          ))}
          {events.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-[var(--text-muted)]">
                No ingest events yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
