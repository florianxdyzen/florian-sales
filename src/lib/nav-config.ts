import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Kanban,
  Users,
  Upload,
  FileText,
  Scale,
  Package,
  UserCog,
  Settings,
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
 * Consumer boards hidden (install, docs, payments, portal, dealers).
 * Dashboard · Leads ▾ · Quotes · Settings ▾
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
        label: "Calling desk",
        icon: Kanban,
        match: ["/leads"],
      },
      { kind: "link", href: "/customers", label: "Accounts", icon: Users, match: ["/accounts"] },
    ],
  },
  { kind: "link", href: "/quotations", label: "Quotes", icon: FileText },
  { kind: "link", href: "/profit", label: "Profit & loss", icon: Scale },
  {
    kind: "group",
    id: "settings",
    label: "Settings",
    icon: UserCog,
    children: [
      { kind: "link", href: "/lead-import", label: "Import", icon: Upload },
      { kind: "link", href: "/catalog", label: "Catalogue", icon: Package },
      { kind: "link", href: "/settings", label: "Company", icon: Settings },
      { kind: "link", href: "/team", label: "Team & Access", icon: UserCog },
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
