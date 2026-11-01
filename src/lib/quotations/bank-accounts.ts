import { BRAND } from "@/lib/quotations/brand";

export type QuotationBankAccount = {
  id: string;
  label: string;
  accountName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branch: string;
  accountType: string;
  upiId: string;
  qrUrl: string;
  enabled: boolean;
};

export const MAX_PRINTED_BANK_ACCOUNTS = 3;

type FlatBankSettings = {
  bank_account_name?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
  branch?: string | null;
} | null | undefined;

type LegacyTemplateBank = {
  qrCodeUrl?: string;
  upiId?: string;
  bankAccountType?: string;
};

function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function emptyBankAccount(id: string): QuotationBankAccount {
  return {
    id,
    label: "",
    accountName: "",
    bankName: "",
    accountNumber: "",
    ifscCode: "",
    branch: "",
    accountType: "",
    upiId: "",
    qrUrl: "",
    enabled: true,
  };
}

/** Parse the stored `bankAccounts` JSON. Rows with no bank name and no A/C number are dropped. */
export function normalizeBankAccounts(raw: unknown): QuotationBankAccount[] {
  if (!Array.isArray(raw)) return [];
  const out: QuotationBankAccount[] = [];
  raw.forEach((row, index) => {
    if (!row || typeof row !== "object") return;
    const r = row as Record<string, unknown>;
    const account: QuotationBankAccount = {
      id: str(r.id, 64) || `bank-${index + 1}`,
      label: str(r.label, 80),
      accountName: str(r.accountName),
      bankName: str(r.bankName),
      accountNumber: str(r.accountNumber, 60),
      ifscCode: str(r.ifscCode, 20).toUpperCase(),
      branch: str(r.branch, 120),
      accountType: str(r.accountType, 40),
      upiId: str(r.upiId, 120),
      qrUrl: str(r.qrUrl, 1000),
      enabled: r.enabled !== false,
    };
    if (!account.bankName && !account.accountNumber) return;
    out.push(account);
  });
  return out;
}

/** Account 1 built from the pre-multi-bank flat columns + template QR / UPI. */
export function legacyBankAccount(
  flat: FlatBankSettings,
  template: LegacyTemplateBank
): QuotationBankAccount {
  return {
    id: "bank-1",
    label: "",
    accountName: flat?.bank_account_name?.trim() || BRAND.bank.accountName,
    bankName: flat?.bank_name?.trim() || BRAND.bank.bankName,
    accountNumber: flat?.account_number?.trim() || BRAND.bank.accountNumber,
    ifscCode: flat?.ifsc_code?.trim() || BRAND.bank.ifscCode,
    branch: flat?.branch?.trim() || BRAND.bank.branch,
    accountType: template.bankAccountType?.trim() || BRAND.bank.accountType,
    upiId: template.upiId?.trim() || BRAND.bank.upiId,
    qrUrl: template.qrCodeUrl?.trim() || BRAND.logo.paymentQr,
    enabled: true,
  };
}

/** All configured accounts; falls back to the legacy single account when none are saved. */
export function resolveBankAccounts(
  template: LegacyTemplateBank & { bankAccounts?: QuotationBankAccount[] },
  flat: FlatBankSettings
): QuotationBankAccount[] {
  if (template.bankAccounts && template.bankAccounts.length > 0) return template.bankAccounts;
  return [legacyBankAccount(flat, template)];
}

/** Enabled accounts in order, capped to what fits on the PDF. */
export function printableBankAccounts(accounts: QuotationBankAccount[]): QuotationBankAccount[] {
  return accounts.filter((a) => a.enabled).slice(0, MAX_PRINTED_BANK_ACCOUNTS);
}

/** QR + UPI printed below the bank blocks: first enabled account that has a QR. */
export function paymentQrAccount(
  accounts: QuotationBankAccount[]
): QuotationBankAccount | null {
  return accounts.find((a) => a.qrUrl.trim()) ?? null;
}

/** Accounts a document should print: `company.bankAccounts` when set, else the single flat block. */
export function accountsForDocument(
  company: {
    name?: string | null;
    bankAccounts?: QuotationBankAccount[];
    bankAccountName?: string | null;
    bankName?: string | null;
    accountNumber?: string | null;
    ifscCode?: string | null;
    branch?: string | null;
  },
  template?: LegacyTemplateBank
): QuotationBankAccount[] {
  if (company.bankAccounts) return company.bankAccounts;
  return [
    {
      ...legacyBankAccount(
        {
          bank_account_name: company.bankAccountName || company.name,
          bank_name: company.bankName,
          account_number: company.accountNumber,
          ifsc_code: company.ifscCode,
          branch: company.branch,
        },
        template ?? {}
      ),
    },
  ];
}

export function bankAccountTitle(account: QuotationBankAccount): string {
  return account.label || account.bankName || "Bank account";
}
