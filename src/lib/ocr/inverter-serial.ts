export function normalizeInverterSerial(raw: string) {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 40);
}

type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

async function tryBarcodeDetector(file: File): Promise<string | null> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Detector) return null;
  const bitmap = await createImageBitmap(file);
  try {
    const detector = new Detector({
      formats: ["code_128", "code_39", "qr_code", "ean_13", "codabar"],
    });
    const codes = await detector.detect(bitmap);
    const value = codes.find((c) => (c.rawValue ?? "").trim().length >= 3)?.rawValue;
    return value ? normalizeInverterSerial(value) : null;
  } catch {
    return null;
  } finally {
    bitmap.close();
  }
}

async function tryTesseract(file: File): Promise<string | null> {
  try {
    const tesseract = await import("tesseract.js");
    const createWorker =
      tesseract.createWorker ??
      (tesseract as { default?: { createWorker?: typeof tesseract.createWorker } }).default
        ?.createWorker;
    if (!createWorker) return null;
    const worker = await createWorker("eng");
    const timeout = new Promise<null>((_, reject) => {
      setTimeout(() => reject(new Error("OCR timed out")), 15_000);
    });
    try {
      const result = (await Promise.race([
        worker.recognize(file),
        timeout,
      ])) as { data?: { text?: string } };
      const text = String(result.data?.text ?? "");
      const candidates = text
        .split(/\s+/)
        .map(normalizeInverterSerial)
        .filter((s) => s.length >= 6);
      return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
    } finally {
      await worker.terminate();
    }
  } catch {
    return null;
  }
}

/** Assistive scan only — caller must keep an editable field. */
export async function scanInverterSerialFromImage(file: File): Promise<{
  serial: string | null;
  method: "barcode" | "ocr" | "none";
}> {
  const fromBarcode = await tryBarcodeDetector(file);
  if (fromBarcode) return { serial: fromBarcode, method: "barcode" };
  const fromOcr = await tryTesseract(file);
  if (fromOcr) return { serial: fromOcr, method: "ocr" };
  return { serial: null, method: "none" };
}

export function barcodeDetectorAvailable() {
  return typeof globalThis !== "undefined" && "BarcodeDetector" in globalThis;
}

/** Live barcode scan from a camera stream. Returns a stop function. */
export function startLiveBarcodeScan(
  video: HTMLVideoElement,
  onSerial: (serial: string) => void
): () => void {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  if (!Detector) return () => undefined;

  let stopped = false;
  let raf = 0;
  const detector = new Detector({
    formats: ["code_128", "code_39", "qr_code", "ean_13", "codabar", "data_matrix"],
  });

  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        const codes = await detector.detect(video);
        const value = codes.find((c) => (c.rawValue ?? "").trim().length >= 3)?.rawValue;
        if (value) {
          onSerial(normalizeInverterSerial(value));
          return;
        }
      }
    } catch {
      // Keep scanning until timeout / unmount.
    }
    raf = requestAnimationFrame(() => {
      void tick();
    });
  };

  void tick();
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
