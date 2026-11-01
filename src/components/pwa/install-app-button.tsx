"use client";

import { useEffect, useState } from "react";
import { Download, Share, Check, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || iosStandalone;
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function InstallAppButton({
  className,
  variant = "secondary",
  size = "sm",
  fullWidth = false,
  showHelpTip = false,
  /** When true, always show a control even before the browser fires install. */
  alwaysVisible = false,
  /** Icon-only on small screens (header). */
  compact = false,
}: {
  className?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  showHelpTip?: boolean;
  alwaysVisible?: boolean;
  compact?: boolean;
}) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    setInstalled(isStandaloneDisplay());
    setIos(isIosDevice());
    setReady(true);

    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setDeferred(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!ready) return null;

  if (installed) {
    if (!showHelpTip) return null;
    return (
      <p className={cn("flex items-center gap-1.5 text-xs text-[var(--success)]", className)}>
        <Check className="h-3.5 w-3.5" aria-hidden />
        App installed on this device
      </p>
    );
  }

  const canNativeInstall = Boolean(deferred);
  if (!canNativeInstall && !ios && !alwaysVisible) {
    return null;
  }

  async function handleInstall() {
    if (deferred) {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    setHelpOpen(true);
  }

  return (
    <div className={cn("shrink-0", fullWidth && "w-full", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn(
          fullWidth && "w-full",
          "border-[var(--primary)] text-[var(--primary)]",
          compact && "max-sm:h-10 max-sm:w-10 max-sm:px-0"
        )}
        title={`Install ${BRAND.name}`}
        onClick={() => {
          void handleInstall();
        }}
      >
        <Download className="h-4 w-4" aria-hidden />
        <span className={cn("whitespace-nowrap", compact && "hidden sm:inline")}>
          Install app
        </span>
      </Button>
      {showHelpTip && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {ios
            ? "Or use Share → Add to Home Screen."
            : canNativeInstall
              ? "Click to install this CRM on your computer or phone."
              : "Install for quick access from your desktop or home screen."}
        </p>
      )}

      <Modal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={ios ? "Install on iPhone" : "Install on this computer"}
        subtitle={`Add ${BRAND.name} like a desktop app`}
      >
        {ios ? (
          <ol className="space-y-3 text-sm text-[var(--text-body)]">
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-faint)] text-xs font-bold text-[var(--primary)]">
                1
              </span>
              <span>
                Tap the{" "}
                <Share className="inline h-4 w-4 align-text-bottom text-[var(--primary)]" aria-hidden />{" "}
                <strong>Share</strong> button in Safari.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-faint)] text-xs font-bold text-[var(--primary)]">
                2
              </span>
              <span>
                Scroll and tap <strong>Add to Home Screen</strong>.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-faint)] text-xs font-bold text-[var(--primary)]">
                3
              </span>
              <span>
                Tap <strong>Add</strong> — then open {BRAND.shortName} from your home screen.
              </span>
            </li>
          </ol>
        ) : (
          <div className="space-y-4 text-sm text-[var(--text-body)]">
            <p className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
              <MonitorSmartphone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" aria-hidden />
              <span>
                In Chrome on Windows, look for the <strong>Install</strong> icon (computer +
                down arrow) on the right side of the address bar, or use the menu below.
              </span>
            </p>
            <ol className="space-y-3">
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-faint)] text-xs font-bold text-[var(--primary)]">
                  1
                </span>
                <span>
                  Open the Chrome menu (<strong>⋮</strong>) in the top-right.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-faint)] text-xs font-bold text-[var(--primary)]">
                  2
                </span>
                <span>
                  Choose <strong>Save and share</strong> → <strong>Install page as app…</strong>{" "}
                  (or <strong>Install {BRAND.shortName}…</strong> if shown).
                </span>
              </li>
              <li className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-faint)] text-xs font-bold text-[var(--primary)]">
                  3
                </span>
                <span>Confirm — a desktop shortcut opens the CRM in its own window.</span>
              </li>
            </ol>
            <p className="text-xs text-[var(--text-muted)]">
              If Install is missing, refresh once (the app needs a secure connection and a short
              moment to become installable).
            </p>
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <Button type="button" variant="secondary" onClick={() => setHelpOpen(false)}>
            Got it
          </Button>
        </div>
      </Modal>
    </div>
  );
}
