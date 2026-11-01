"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PrintToolbar({
  quotationNo,
  backHref,
  listHref = "/quotations",
  autoPrint = false,
}: {
  quotationNo: string;
  backHref: string;
  listHref?: string;
  autoPrint?: boolean;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!autoPrint) return;
    let cancelled = false;
    let timer: number | undefined;
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    const fallback = new Promise<void>((resolve) => window.setTimeout(resolve, 3000));
    void Promise.race([fontsReady, fallback]).then(() => {
      if (cancelled) return;
      timer = window.setTimeout(() => window.print(), 150);
    });
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [autoPrint]);

  function handlePrint() {
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    void fontsReady.then(() => window.print());
  }

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backHref);
  }

  return (
    <div className="qp-toolbar">
      <p>
        Print-ready quotation · <strong>{quotationNo}</strong> · Use browser Print → Save as PDF.
        If colours look faded, tick “Background graphics” in the print dialog.
      </p>
      <div className="qp-toolbar-actions">
        <button type="button" className="qp-btn-ghost" onClick={handleBack}>
          Back
        </button>
        <a className="qp-btn-ghost" href={listHref}>
          All quotations
        </a>
        <button type="button" className="qp-btn-print" onClick={handlePrint}>
          Print / Save PDF
        </button>
      </div>
    </div>
  );
}
