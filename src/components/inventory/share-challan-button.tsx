"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";

export function ShareChallanButton({
  movementId,
  movementNo,
  variant = "delivery",
}: {
  movementId: string;
  movementNo: string;
  variant?: "delivery" | "return";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href = `/api/inventory/challans/${movementId}/pdf`;
  const title = variant === "return" ? `Return challan ${movementNo}` : `Delivery challan ${movementNo}`;
  const label = variant === "return" ? "Share return challan" : "Share";

  async function share() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(href);
      if (!res.ok) throw new Error("Could not load the challan.");
      const file = new File([await res.blob()], `${movementNo}.pdf`, { type: "application/pdf" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title });
      } else {
        window.open(href, "_blank", "noopener");
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Could not share the challan.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={share}
        disabled={busy}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border-[1.5px] border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--text-body)] hover:border-[var(--text-muted)] disabled:opacity-60"
      >
        <Share2 className="h-4 w-4" /> {busy ? "Preparing…" : label}
      </button>
      {error && <p className="w-full text-sm text-[var(--error)]">{error}</p>}
    </>
  );
}
