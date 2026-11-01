import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return "ΓÇö";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return "ΓÇö";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(date));
}

/** Compact lead age for cards, e.g. "2d", "3d". Under 24h shows hours ("5h"). */
export function formatAgeShort(date: string | null | undefined): string {
  if (!date) return "ΓÇö";
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return "ΓÇö";
  const ms = Math.max(0, Date.now() - then);
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) {
    if (hours < 1) return "<1h";
    return `${hours}h`;
  }
  return `${Math.floor(hours / 24)}d`;
}

export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone;
}

export function formatCurrency(amount: number | null | undefined): string {
  const n = Number(amount ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}
