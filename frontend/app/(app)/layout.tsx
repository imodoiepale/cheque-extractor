import Link from 'next/link';
import Image from 'next/image';
import { Upload, Settings, List, BarChart3, Download, Receipt, GitCompare, LayoutDashboard, Scale, ArrowLeftRight } from 'lucide-react';
import UserProfile from '@/components/UserProfile';
import QBProviderWrapper from '@/components/QBProviderWrapper';
import SidebarCompanySwitcher from '@/components/SidebarCompanySwitcher';
import SuperAdminLink from '@/components/SuperAdminLink';
import AccountSwitcher from '@/components/AccountSwitcher';

const NAV_ITEMS = [
  { href: '/firm-dashboard', icon: LayoutDashboard, label: 'Firm Dashboard' },
  { href: '/upload', icon: Upload, label: 'Upload' },
  { href: '/dashboard', icon: List, label: 'Documents' },
  // { href: '/reconciliation', icon: Scale, label: 'Reconciliation' }, 
  { href: '/qb-comparisons', icon: GitCompare, label: 'QB Comparisons' },
  { href: '/qb-match', icon: ArrowLeftRight, label: 'QB Match' },
  { href: '/export', icon: Download, label: 'Export' },
  { href: '/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/billing', icon: Receipt, label: 'Billing' },
];

// One nav row recipe, shared with the admin shell's rows so the two chromes
// read as the same product. Dark substrate, so colour comes off `shell-*`.
const SHELL_NAV_ROW =
  'flex items-center gap-2.5 px-2.5 py-[7px] text-[13px] font-medium rounded-input ' +
  'text-shell-muted hover:text-shell-text hover:bg-shell-text/[0.08] ' +
  'transition-[color,background-color] duration-tap ease-settle';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Route protection is handled by proxy.ts
  return (
    <QBProviderWrapper>
      {/* No background of its own: the shell and the pages sit over the
          ambient mesh mounted in app/layout.tsx. Glass needs something to
          refract — painting a flat hex here is what made it read as grey. */}
      <div className="min-h-screen flex">
        {/* Shell chrome: dark true glass, heaviest blur tier. Nothing inside
            it may carry a backdrop-filter of its own (rule 2). */}
        <aside className="w-60 glass-shell border-r text-shell-text hidden md:flex flex-col fixed left-0 top-0 h-screen">
          <div className="px-5 py-5 border-b border-glass-hairline-dark flex-shrink-0">
            <Link href="/dashboard" className="flex items-center gap-2.5 font-semibold text-[15px] text-shell-text">
              <Image src="/Kyriq_Logo_Files/kyriq-icon.svg" alt="Kyriq" width={28} height={28} className="rounded-md" />
              <span className="font-extrabold tracking-wordmark">kyriq</span>
            </Link>
          </div>

          <SidebarCompanySwitcher />
          <AccountSwitcher />

          {/* Scrolls inside the fixed shell, so the page itself still has
              exactly one scrollbar. */}
          <nav className="flex-1 px-3 py-3 space-y-0.5 scroll-region">
            {NAV_ITEMS.map(item => (
              <Link key={item.href} href={item.href} className={`sidebar-item ${SHELL_NAV_ROW}`}>
                <item.icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            ))}

            <div className="my-2 border-t border-glass-hairline-dark" />

            <Link href="/settings" className={`sidebar-item ${SHELL_NAV_ROW}`}>
              <Settings className="w-4 h-4" />
              <span>Settings</span>
            </Link>

            <SuperAdminLink />
          </nav>

          <div className="border-t border-glass-hairline-dark flex-shrink-0">
            <div className="px-2 py-3">
              <UserProfile />
            </div>
            <div className="px-5 py-2 text-[11px] text-shell-muted/70 text-center">
              Kyriq v1.0.0
            </div>
          </div>
        </aside>

        {/* Main content. Deliberately NOT a scroll container: the document
            scrolls, and pages that need their own scroll (tables) declare it. */}
        <main className="flex-1 min-w-0 md:ml-60">
          {/* Mobile header. The shell is hidden here, so this is the only
              blurred chrome on screen. */}
          <div className="md:hidden px-4 py-3 glass-chrome border-b flex justify-between items-center">
            <Link href="/dashboard" className="font-semibold text-[15px] text-ink-strong flex items-center gap-2">
              <Image src="/Kyriq_Logo_Files/kyriq-icon.svg" alt="Kyriq" width={24} height={24} className="rounded-md" />
              Kyriq
            </Link>
            <Link href="/upload" className="p-1.5 bg-primary-bg rounded-input press">
              <Upload className="w-4 h-4 text-primary-text" />
            </Link>
          </div>

          {children}
        </main>
      </div>
    </QBProviderWrapper>
  );
}
