'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { isSuperAdmin } from '@/lib/super-admin';
import {
  Crown, LayoutDashboard, Building2, DollarSign, Receipt,
  ArrowLeft, RefreshCw, ChevronRight
} from 'lucide-react';

const ADMIN_NAV = [
  { href: '/admin', icon: LayoutDashboard, label: 'Overview' },
  { href: '/admin/tenants', icon: Building2, label: 'Accounts' },
  { href: '/admin/firms', icon: Receipt, label: 'Firms & billing' },
  { href: '/admin/revenue', icon: DollarSign, label: 'Revenue' },
];

// Same row recipe as the (app) shell. The two shells are deliberately one
// chrome: the admin section is marked by its eyebrow and crown, not by a
// different substrate.
const SHELL_NAV_ROW =
  'flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-input ' +
  'transition-[color,background-color] duration-tap ease-settle';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const check = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user && isSuperAdmin(user.email)) {
        setAuthorized(true);
        setUserEmail(user.email || '');
      } else {
        router.push('/dashboard');
      }
      setLoading(false);
    };
    check();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!authorized) return null;

  return (
    // Transparent over the ambient mesh — see app/layout.tsx.
    <div className="min-h-screen flex">
      {/* Shell chrome, identical to the (app) shell: dark true glass, heaviest
          blur tier, nothing blurred nested inside it. */}
      <aside className="w-60 glass-shell border-r text-shell-text hidden md:flex flex-col fixed left-0 top-0 h-screen">
        <div className="px-5 py-5 border-b border-glass-hairline-dark">
          <div className="flex items-center gap-2.5">
            <Image src="/Kyriq_Logo_Files/kyriq-icon.svg" alt="Kyriq" width={32} height={32} className="rounded-md" />
            <div>
              <div className="text-sm font-bold text-shell-text tracking-wordmark">Kyriq</div>
              <div className="flex items-center gap-1 text-[10px] text-shell-muted">
                <Crown size={10} className="text-warning" />
                Super Admin
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 scroll-region">
          {ADMIN_NAV.map((item) => {
            const isActive = item.href === '/admin'
              ? pathname === '/admin'
              : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`sidebar-item ${SHELL_NAV_ROW} ${
                  isActive
                    ? 'active bg-shell-text/[0.08] text-shell-active'
                    : 'text-shell-muted hover:text-shell-text hover:bg-shell-text/[0.08]'
                }`}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
                {isActive && <ChevronRight size={12} className="ml-auto text-shell-active" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-glass-hairline-dark p-4 space-y-3">
          <Link
            href="/dashboard"
            className={`${SHELL_NAV_ROW} text-brand-light hover:text-shell-text hover:bg-shell-text/[0.08]`}
          >
            <ArrowLeft size={14} />
            <span>Back to App</span>
          </Link>
          <div className="px-3 text-[10px] text-shell-muted/70 truncate">{userEmail}</div>
        </div>
      </aside>

      {/* Mobile header. The shell is hidden here, so this is the only blurred
          chrome on screen and may carry its own blur. */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 glass-chrome border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Image src="/Kyriq_Logo_Files/kyriq-icon.svg" alt="Kyriq" width={20} height={20} className="rounded" />
          <span className="text-sm font-bold text-ink-strong">Kyriq Admin</span>
        </div>
        <div className="flex items-center gap-2">
          {ADMIN_NAV.map((item) => {
            const isActive = item.href === '/admin'
              ? pathname === '/admin'
              : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`p-2 rounded-input press ${
                  isActive ? 'bg-primary-bg text-primary-text' : 'text-ink-faint'
                }`}
              >
                <item.icon size={16} />
              </Link>
            );
          })}
          <Link href="/dashboard" className="p-2 rounded-input press text-primary-text">
            <ArrowLeft size={16} />
          </Link>
        </div>
      </div>

      {/* Not a scroll container — one scrollbar per page. */}
      <main className="flex-1 min-w-0 md:ml-60 mt-14 md:mt-0 min-h-screen">
        {children}
      </main>
    </div>
  );
}
