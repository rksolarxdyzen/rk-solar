export type ImportRowError = {
  rowNumber: number;
  message: string;
  name?: string;
  phone?: string;
};

/** Canonical import fields → spreadsheet header labels (Phase 5b). */
export type LeadImportColumnMapping = {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  requirement?: string;
};

export const IMPORT_FIELD_LABELS: Record<keyof LeadImportColumnMapping, string> = {
  name: "Name",
  phone: "Phone",
  address: "Address",
  city: "City",
  requirement: "Requirement / notes",
};
