"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { uploadBankAccountQr } from "@/lib/quotations/actions/template";
import {
  MAX_PRINTED_BANK_ACCOUNTS,
  bankAccountTitle,
  emptyBankAccount,
  type QuotationBankAccount,
} from "@/lib/quotations/bank-accounts";
import { cn } from "@/lib/utils";

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `bank-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function BankAccountsEditor({
  accounts,
  onChange,
  disabled,
  onError,
}: {
  accounts: QuotationBankAccount[];
  onChange: (next: QuotationBankAccount[]) => void;
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const enabledCount = accounts.filter((a) => a.enabled).length;

  function update(id: string, patch: Partial<QuotationBankAccount>) {
    onChange(accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= accounts.length) return;
    const next = [...accounts];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function remove(account: QuotationBankAccount) {
    if (accounts.length <= 1) return;
    if (!window.confirm(`Remove ${bankAccountTitle(account)} from the template?`)) return;
    onChange(accounts.filter((a) => a.id !== account.id));
  }

  return (
    <div className="space-y-3">
      {enabledCount === 0 && (
        <p className="rounded-lg bg-[var(--error-light)] px-3 py-2 text-xs text-[var(--error)]">
          No account enabled. Quotations will show no bank details.
        </p>
      )}
      {enabledCount > MAX_PRINTED_BANK_ACCOUNTS && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Only the first {MAX_PRINTED_BANK_ACCOUNTS} enabled accounts fit on the PDF.
        </p>
      )}

      {accounts.map((account, index) => (
        <BankAccountCard
          key={account.id}
          account={account}
          index={index}
          total={accounts.length}
          disabled={disabled}
          onPatch={(patch) => update(account.id, patch)}
          onMove={(dir) => move(index, dir)}
          onRemove={() => remove(account)}
          onError={onError}
        />
      ))}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...accounts, emptyBankAccount(newId())])}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--primary)]/50 px-3 py-2 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-faint)] disabled:opacity-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Add bank account
      </button>
    </div>
  );
}

function BankAccountCard({
  account,
  index,
  total,
  disabled,
  onPatch,
  onMove,
  onRemove,
  onError,
}: {
  account: QuotationBankAccount;
  index: number;
  total: number;
  disabled?: boolean;
  onPatch: (patch: Partial<QuotationBankAccount>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onError?: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadQr(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadBankAccountQr(fd);
      if (res.ok) onPatch({ qrUrl: res.url });
      else onError?.(res.error);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      className={cn(
        "space-y-2 rounded-xl border p-3",
        account.enabled
          ? "border-[var(--primary)]/40 bg-white"
          : "border-[var(--border)] bg-[var(--bg)] opacity-80"
      )}
    >
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center gap-2 text-xs font-semibold text-[var(--text-dark)]">
          <input
            type="checkbox"
            checked={account.enabled}
            disabled={disabled}
            onChange={(e) => onPatch({ enabled: e.target.checked })}
            className="h-4 w-4 accent-[var(--primary)]"
          />
          Enabled · Account {index + 1}
          <span className="truncate font-normal text-[var(--text-muted)]">
            {bankAccountTitle(account)}
          </span>
        </label>
        <IconButton label="Move up" disabled={disabled || index === 0} onClick={() => onMove(-1)}>
          <ArrowUp className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          label="Move down"
          disabled={disabled || index === total - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton
          label="Remove account"
          disabled={disabled || total <= 1}
          onClick={onRemove}
          danger
        >
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      </div>

      <SmallField
        label="Label (optional)"
        value={account.label}
        placeholder="e.g. ICICI Current"
        disabled={disabled}
        onChange={(v) => onPatch({ label: v })}
      />
      <SmallField
        label="Account name"
        value={account.accountName}
        disabled={disabled}
        onChange={(v) => onPatch({ accountName: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <SmallField
          label="Bank name"
          value={account.bankName}
          disabled={disabled}
          onChange={(v) => onPatch({ bankName: v })}
        />
        <SmallField
          label="Account number"
          value={account.accountNumber}
          disabled={disabled}
          onChange={(v) => onPatch({ accountNumber: v })}
        />
        <SmallField
          label="IFSC"
          value={account.ifscCode}
          disabled={disabled}
          onChange={(v) => onPatch({ ifscCode: v.toUpperCase() })}
        />
        <SmallField
          label="Account type"
          value={account.accountType}
          disabled={disabled}
          onChange={(v) => onPatch({ accountType: v })}
        />
        <SmallField
          label="Branch name"
          value={account.branch}
          disabled={disabled}
          onChange={(v) => onPatch({ branch: v })}
        />
        <SmallField
          label="UPI ID"
          value={account.upiId}
          disabled={disabled}
          onChange={(v) => onPatch({ upiId: v })}
        />
      </div>

      <div className="flex items-center gap-3">
        {account.qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={account.qrUrl}
            alt="Payment QR"
            className="h-16 w-16 rounded border border-[var(--border-light)] bg-white object-contain p-0.5"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed border-[var(--border)] text-[0.6rem] text-[var(--text-muted)]">
            No QR
          </div>
        )}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-white px-2 py-1 text-xs font-semibold text-[var(--text-body)] hover:bg-[var(--bg)] disabled:opacity-50"
          >
            <Upload className="h-3.5 w-3.5" />
            {uploading ? "Uploading…" : account.qrUrl ? "Replace QR" : "Upload QR"}
          </button>
          {account.qrUrl && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPatch({ qrUrl: "" })}
              className="text-left text-xs text-[var(--text-muted)] hover:text-[var(--error)]"
            >
              Remove QR
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void uploadQr(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  danger,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg)] disabled:opacity-30",
        danger ? "hover:text-[var(--error)]" : "hover:text-[var(--primary)]"
      )}
    >
      {children}
    </button>
  );
}

function SmallField({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <Input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
