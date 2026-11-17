/** Normalize Indian mobile to 10 digits when possible. */
export function normalizeAdPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
}

export function isValidAdPhone(phone: string): boolean {
  const digits = normalizeAdPhone(phone);
  return digits.length === 10 && /^[6-9]/.test(digits);
}
