"use client";

import { useRef, useState } from "react";
import { CheckCircle2, FileText, Loader2, UploadCloud, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type DropFileStatus = "queued" | "uploading" | "done" | "failed";

export type DropFile = {
  id: string;
  file: File;
  status: DropFileStatus;
  error?: string;
};

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function toDropFiles(files: File[]): DropFile[] {
  return files.map((file) => ({
    id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    status: "queued" as const,
  }));
}

export function FileDropZone({
  files,
  onAdd,
  onRemove,
  accept,
  multiple = true,
  disabled = false,
  hint,
}: {
  files: DropFile[];
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function take(list: FileList | null) {
    if (!list || list.length === 0) return;
    const picked = Array.from(list);
    onAdd(multiple ? picked : picked.slice(0, 1));
  }

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) take(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition",
          dragging
            ? "border-[var(--primary)] bg-[var(--primary-faint)]"
            : "border-[var(--border)] bg-[var(--bg)] hover:border-[var(--primary)]/50",
          disabled && "cursor-not-allowed opacity-60"
        )}
      >
        <UploadCloud className="h-7 w-7 text-[var(--primary)]" />
        <p className="text-sm text-[var(--text-body)]">
          Drag &amp; drop {multiple ? "files" : "a file"} here or{" "}
          <span className="font-semibold text-[var(--primary)] underline">browse</span>
        </p>
        {hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            take(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-lg border border-[var(--border-light)] bg-white px-3 py-2 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-[var(--text-dark)]">{item.file.name}</p>
                <p
                  className={cn(
                    "text-xs",
                    item.status === "failed" ? "text-[var(--error)]" : "text-[var(--text-muted)]"
                  )}
                >
                  {item.status === "failed" && item.error
                    ? item.error
                    : `${formatSize(item.file.size)} · ${
                        item.status === "queued"
                          ? "Ready"
                          : item.status === "uploading"
                            ? "Uploading…"
                            : item.status === "done"
                              ? "Uploaded"
                              : "Failed"
                      }`}
                </p>
              </div>
              {item.status === "uploading" && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--primary)]" />
              )}
              {item.status === "done" && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success)]" />
              )}
              {item.status === "failed" && (
                <XCircle className="h-4 w-4 shrink-0 text-[var(--error)]" />
              )}
              {(item.status === "queued" || item.status === "failed") && (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  disabled={disabled}
                  aria-label={`Remove ${item.file.name}`}
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--error)]"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
