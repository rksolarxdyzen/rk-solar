"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { saveInverterSerial } from "@/actions/installation";
import { scanInverterSerialFromImage } from "@/lib/ocr/inverter-serial";

export function InverterSerialCapture({
  leadId,
  initialSerial,
  disabled,
  onSaved,
}: {
  leadId: string;
  initialSerial?: string | null;
  disabled?: boolean;
  onSaved: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [serial, setSerial] = useState(initialSerial ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onPick(file: File) {
    setError(null);
    setHint("Reading serial…");
    setPreview(URL.createObjectURL(file));
    startTransition(async () => {
      try {
        const result = await scanInverterSerialFromImage(file);
        if (result.serial) {
          setSerial(result.serial);
          setHint(
            result.method === "barcode"
              ? "Barcode read — confirm before saving"
              : "OCR read — confirm or edit before saving"
          );
        } else {
          setHint("Couldn’t read serial — type it manually");
        }
      } catch {
        setHint("Scanner unavailable — type serial manually");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div>
        <Label>Inverter serial</Label>
        <Input
          value={serial}
          disabled={disabled || pending}
          onChange={(e) => setSerial(e.target.value)}
          placeholder="Type or scan from nameplate"
        />
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Inverter nameplate preview" className="max-h-40 rounded-lg border border-[var(--border)]" />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={disabled || pending}
          onClick={() => inputRef.current?.click()}
        >
          Scan / upload photo
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={disabled || pending || serial.trim().length < 3}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              try {
                await saveInverterSerial({ leadId, serial });
                onSaved();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Could not save serial");
              }
            })
          }
        >
          {pending ? "Saving…" : "Save inverter serial"}
        </Button>
      </div>
      {hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
      {error && <p className="text-xs text-[var(--error)]">{error}</p>}
    </div>
  );
}
