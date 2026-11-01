import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Kanban,
  Users,
  Upload,
  Share2,
  FileText,
  Package,
  Wallet,
  HardHat,
  Building2,
  Wrench,
  UserCog,
  MessageSquareWarning,
  Handshake,
  BarChart3,
} from "lucide-react";

export type NavLinkItem = {
  kind: "link";
  href: string;
  label: string;
  icon: LucideIcon;
  /** Extra path prefixes that count as active */
  match?: string[];
};

export type NavGroupItem = {
  kind: "group";
  id: string;
  label: string;
  icon: LucideIcon;
  children: NavLinkItem[];
};

export type NavEntry = NavLinkItem | NavGroupItem;

/**
 * Phase 3a hierarchy:
 * Dashboard · Leads ▾ · Installation · Documentation · Others ▾ · Settings ▾
 * Reminders removed from primary nav → Alerts drawer.
 */
export const NAV_ENTRIES: NavEntry[] = [
  { kind: "link", href: "/", label: "Dashboard", icon: LayoutDashboard },
  {
    kind: "group",
    id: "leads",
    label: "Leads",
    icon: Kanban,
    children: [
      {
        kind: "link",
        href: "/pipeline",
        label: "Pipeline board",
        icon: Kanban,
        match: ["/leads"],
      },
      { kind: "link", href: "/customers", label: "Customers", icon: Users },
    ],
  },
  {
    kind: "link",
    href: "/installation",
    label: "Installation",
    icon: HardHat,
  },
  {
    kind: "link",
    href: "/liaison",
    label: "Documentation",
    icon: Building2,
    match: ["/documentation", "/feasibility"],
  },
  {
    kind: "group",
    id: "others",
    label: "Others",
    icon: FileText,
    children: [
      { kind: "link", href: "/quotations", label: "Quotes", icon: FileText },
      {
        kind: "link",
        href: "/inventory",
        label: "Inventory",
        icon: Package,
        match: ["/inventory"],
      },
      { kind: "link", href: "/payments", label: "Payments", icon: Wallet },
      {
        kind: "link",
        href: "/accounts/receivables",
        label: "Receivables",
        icon: Wallet,
        match: ["/accounts"],
      },
      {
        kind: "link",
        href: "/reports/sales-reps",
        label: "Sales report",
        icon: BarChart3,
        match: ["/reports/sales-reps"],
      },
      {
        kind: "link",
        href: "/reports/dealers",
        label: "Dealer report",
        icon: Handshake,
        match: ["/reports/dealers"],
      },
      { kind: "link", href: "/maintenance", label: "Service", icon: Wrench },
    ],
  },
  {
    kind: "group",
    id: "settings",
    label: "Settings",
    icon: UserCog,
    children: [
      { kind: "link", href: "/lead-import", label: "Import", icon: Upload },
      { kind: "link", href: "/ingest", label: "Ingest", icon: Share2 },
      { kind: "link", href: "/catalog", label: "Catalogue", icon: Package },
      { kind: "link", href: "/team", label: "Team & Access", icon: UserCog },
      {
        kind: "link",
        href: "/dealers",
        label: "Dealers",
        icon: Handshake,
      },
      {
        kind: "link",
        href: "/grievances",
        label: "Grievances",
        icon: MessageSquareWarning,
      },
    ],
  },
];

export function flattenNavLinks(entries: NavEntry[] = NAV_ENTRIES): NavLinkItem[] {
  const out: NavLinkItem[] = [];
  for (const entry of entries) {
    if (entry.kind === "link") out.push(entry);
    else out.push(...entry.children);
  }
  return out;
}

export function isNavHrefActive(pathname: string, item: NavLinkItem): boolean {
  if (item.href === "/") return pathname === "/";
  if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return true;
  return (item.match ?? []).some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function isNavGroupActive(pathname: string, group: NavGroupItem): boolean {
  return group.children.some((child) => isNavHrefActive(pathname, child));
}
