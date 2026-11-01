"use client";

import { useEffect, useRef, useState } from "react";
import { Input, Label } from "@/components/ui/input";
import { ProofUploadField } from "@/components/ui/proof-upload-button";
import {
  barcodeDetectorAvailable,
  startLiveBarcodeScan,
} from "@/lib/ocr/inverter-serial";
import { cn } from "@/lib/utils";

const SCAN_UNLOCK_MS = 10_000;

async function openBarcodeCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("no-camera");
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
  } catch {
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

export function PanelCaptureStep({
  leadId,
  companyId,
  panelIndex,
  enabled,
  alreadyUploaded,
  disabled,
  onUploaded,
}: {
  leadId: string;
  companyId: string;
  panelIndex: number;
  enabled: boolean;
  alreadyUploaded: boolean;
  disabled?: boolean;
  onUploaded: (fileUrl: string, serial: string) => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [serial, setSerial] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(10);
  const [unlocked, setUnlocked] = useState(false);
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [hasPreview, setHasPreview] = useState(false);

  useEffect(() => {
    if (!enabled || alreadyUploaded) return;

    let stream: MediaStream | null = null;
    let stopScan: (() => void) | undefined;
    let tick: ReturnType<typeof setInterval> | undefined;
    const started = Date.now();
    setSecondsLeft(10);
    setUnlocked(false);
    setSerial("");
    setHasPreview(false);

    const canLiveScan = barcodeDetectorAvailable() && Boolean(navigator.mediaDevices?.getUserMedia);
    if (!canLiveScan) {
      setScanHint("Type the serial if you can, or wait 10 seconds and take the panel photo.");
    } else {
      setScanHint("Point the camera at the barcode. The preview appears only if the camera starts.");
    }

    void (async () => {
      if (!canLiveScan) return;
      try {
        stream = await openBarcodeCamera();
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
          setScanHint("Type the serial if you can, or wait 10 seconds and take the panel photo.");
          return;
        }
        video.srcObject = stream;
        video.muted = true;
        await video.play();
        setHasPreview(true);
        stopScan = startLiveBarcodeScan(video, (value) => {
          setSerial(value);
          setUnlocked(true);
          setScanHint("Serial recorded — take the panel photo below.");
        });
      } catch {
        setHasPreview(false);
        setScanHint("Camera preview not available here. Type the serial or wait 10 seconds, then take the photo.");
      }
    })();

    tick = setInterval(() => {
      const left = Math.max(0, Math.ceil((SCAN_UNLOCK_MS - (Date.now() - started)) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setUnlocked(true);
        setScanHint((prev) =>
          prev?.includes("Serial recorded")
            ? prev
            : "No serial yet — you can photograph now, or type the number."
        );
      }
    }, 250);

    return () => {
      if (tick) clearInterval(tick);
      stopScan?.();
      stream?.getTracks().forEach((t) => t.stop());
      const video = videoRef.current;
      if (video) video.srcObject = null;
      setHasPreview(false);
    };
  }, [enabled, alreadyUploaded, panelIndex]);

  useEffect(() => {
    if (serial.trim().length >= 3) setUnlocked(true);
  }, [serial]);

  const canShoot = enabled && !alreadyUploaded && !disabled && unlocked;

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-[var(--text-dark)]">Panel {panelIndex}</p>
      {!enabled && (
        <p className="text-xs text-[var(--text-muted)]">
          Upload Panel {panelIndex - 1} first.
        </p>
      )}
      {alreadyUploaded && (
        <p className="text-xs text-[var(--success)]">Photo uploaded.</p>
      )}
      {enabled && !alreadyUploaded && (
        <>
          <video
            ref={videoRef}
            className={cn(
              "w-full rounded-lg bg-black object-cover",
              hasPreview ? "max-h-48" : "hidden h-0"
            )}
            muted
            playsInline
            autoPlay
          />
          <div>
            <Label>Serial (optional)</Label>
            <Input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="Fills from barcode, or type"
              disabled={disabled}
            />
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {unlocked
              ? scanHint
              : `Looking for barcode… you can photograph in ${secondsLeft}s if no number appears.`}
          </p>
          <ProofUploadField
            folder="installation"
            entityId={leadId}
            companyId={companyId}
            disabled={!canShoot}
            kind="photo"
            capture="environment"
            label={canShoot ? "Take panel photo" : "Waiting to unlock photo"}
            onUploaded={async (url) => onUploaded(url, serial.trim())}
          />
        </>
      )}
    </div>
  );
}
