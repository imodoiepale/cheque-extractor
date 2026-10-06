import {
  Upload,
  Settings,
  List,
  Download,
  Receipt,
  GitCompare,
  LayoutDashboard,
  ArrowLeftRight,
  Scale,
  Users,
  Plug,
} from 'lucide-react';

/**
 * The app shell's navigation, in CHECKLIST section 3's order, with Reconcile
 * first because that is the daily job.
 *
 * Two of section 3's labels have no route of their own yet, so each is served
 * by the page that does that job today rather than linking to a 404: Reports
 * by the firm dashboard, and Companies by Settings → Integrations, which is
 * literally the connected-company list, so it carries the label "Connections".
 * /qb-match stays until the Review merge removes it.
 *
 * This lives outside app/(app)/layout.tsx so the shape is importable by
 * scripts/check-reconcile.ts — a layout may only export a component.
 */
export interface ShellNavItem {
  href: string;
  icon: any;
  label: string;
}

export const NAV_GROUPS: { label: string | null; items: ShellNavItem[] }[] = [
  {
    label: null,
    items: [
      { href: '/reconcile', icon: Scale, label: 'Reconcile' },
      { href: '/upload', icon: Upload, label: 'Upload' },
      { href: '/dashboard', icon: List, label: 'History' },
      { href: '/firm-dashboard', icon: LayoutDashboard, label: 'Reports' },
    ],
  },
  {
    label: 'Review',
    items: [
      { href: '/qb-match', icon: ArrowLeftRight, label: 'QB Match' },
      { href: '/qb-comparisons', icon: GitCompare, label: 'QB Comparisons' },
      { href: '/export', icon: Download, label: 'Export' },
    ],
  },
  {
    label: 'Firm',
    items: [
      { href: '/settings?tab=integrations', icon: Plug, label: 'Connections' },
      { href: '/settings/team', icon: Users, label: 'Users' },
      { href: '/billing', icon: Receipt, label: 'Billing' },
      { href: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

/**
 * Does this row describe the page on screen? Compared on the path only, so a
 * row carrying a query string still matches, and prefix-matched so detail
 * routes light up their section.
 */
export function isActiveHref(href: string, pathname: string | null): boolean {
  if (!pathname) return false;
  const path = href.split('?')[0];
  return path === pathname || pathname.startsWith(`${path}/`);
}

/**
 * The ONE row that gets `.active`.
 *
 * Longest matching path first, otherwise /settings and /settings/team would
 * both be highlighted at once. Ties are broken towards the row with no query
 * string: /settings and /settings?tab=integrations match the same path, and on
 * /settings it is Settings that is open, not Connections.
 */
export function activeNavHref(pathname: string | null): string | null {
  const matches = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href)).filter((href) =>
    isActiveHref(href, pathname)
  );
  if (matches.length === 0) return null;
  return matches.sort(
    (a, b) => b.split('?')[0].length - a.split('?')[0].length || a.length - b.length
  )[0];
}
