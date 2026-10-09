/**
 * Kyriq admin navigation: one list for the side nav, the mobile tab bar and
 * the ⌘K palette (DepthMe kept three copies). Paths are relative to /admin.
 */
import {
  Zap, DollarSign, Calculator, Receipt, Users, Building2, CreditCard,
  BarChart2, TrendingUp, FlaskConical, FileText, Settings, type LucideIcon,
} from 'lucide-react';

export type AdminNavItem = { to: string; label: string; icon: LucideIcon; end?: boolean; primary?: boolean };

export const ADMIN_NAV: AdminNavItem[] = [
  { to: '/', label: 'Pulse', icon: Zap, end: true, primary: true },
  { to: '/revenue', label: 'Revenue', icon: DollarSign, primary: true },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/calculator', label: 'Profit Calculator', icon: Calculator },
  { to: '/users', label: 'Users', icon: Users, primary: true },
  { to: '/tenants', label: 'Firms', icon: Building2 },
  { to: '/firms', label: 'Firms & billing', icon: CreditCard },
  { to: '/analytics', label: 'Analytics', icon: BarChart2 },
  { to: '/growth', label: 'Growth', icon: TrendingUp },
  { to: '/lab', label: 'OCR Lab', icon: FlaskConical },
  { to: '/audit', label: 'Audit Log', icon: FileText, primary: true },
  { to: '/settings', label: 'Settings', icon: Settings },
];
