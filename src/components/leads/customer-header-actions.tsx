"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle, Phone } from "lucide-react";
import { StageStepper } from "@/components/leads/stage-stepper";
import {
  buildPortalInviteWhatsAppHref,
  buildWhatsAppHref,
  portalAbsoluteUrl,
  portalPath,
} from "@/lib/domain/portal";
import type { SalesStage } from "@/lib/domain/workflow";
import { cn, formatPhone } from "@/lib/utils";

export function CustomerHeaderActions({
  name,
  phone,
  portalCode,
  salesStage,
  city,
}: {
  name: string;
  phone: string;
  portalCode?: string | null;
  salesStage: SalesStage;
  city?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const absoluteUrl = portalCode ? portalAbsoluteUrl(portalCode, origin) : "";

  async function copyPortalLink() {
    if (!absoluteUrl) return;
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ignore clipboard failures (insecure context / denied).
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="-mx-1">
        <StageStepper current={salesStage} disabled variant="minimal" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {city ? (
          <span className="text-xs text-[var(--text-muted)]">{city}</span>
        ) : null}
        {portalCode ? (
          <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1">
            <span className="font-mono text-xs font-semibold text-[var(--primary)]">
              {portalCode}
            </span>
            <a
              href={portalPath(portalCode)}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1 text-[var(--primary)] hover:bg-[var(--primary-faint)]"
              aria-label="Open customer portal"
              title="Open portal"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={() => void copyPortalLink()}
              className="rounded p-1 text-[var(--text-muted)] hover:bg-white hover:text-[var(--primary)]"
              aria-label="Copy portal link"
              title="Copy portal link"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-[var(--success)]" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        ) : (
          <span className="text-xs text-[var(--text-muted)]">Portal code pending</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={`tel:${phone}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-faint)]"
          )}
        >
          <Phone className="h-3.5 w-3.5" />
          {formatPhone(phone)}
        </a>
        <a
          href={buildWhatsAppHref(phone)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--success)] hover:bg-[var(--success-light)]"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          WhatsApp
        </a>
        {portalCode ? (
          <a
            href={buildPortalInviteWhatsAppHref({
              customerName: name,
              phone,
              portalCode,
              origin,
            })}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--success)] bg-[var(--success-light)] px-2.5 py-1.5 text-xs font-semibold text-[var(--success)] hover:opacity-90"
            title="Send portal link on WhatsApp"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Share portal
          </a>
        ) : null}
      </div>
    </div>
  );
}
