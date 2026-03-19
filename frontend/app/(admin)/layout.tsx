'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { isSuperAdmin } from '@/lib/super-admin';
import {
  Crown, LayoutDashboard, Building2, Users, DollarSign,
  ArrowLeft, RefreshCw, ChevronRight
} from 'lucide-react';

const ADMIN_NAV = [
  { href: '/admin', icon: LayoutDashboard, label: 'Overview' },
  { href: '/admin/tenants', icon: Building2, label: 'Accounts' },
  { href: '/admin/revenue', icon: DollarSign, label: 'Revenue' },
];

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
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <RefreshCw size={24} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex">
      {/* Sidebar */}
      <aside className="w-[240px] bg-white/80 backdrop-blur-xl border-r border-gray-200/60 hidden md:flex flex-col fixed left-0 top-0 h-screen">
        <div className="px-5 py-5 border-b border-gray-100/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg flex items-center justify-center">
              <Crown size={16} className="text-white" />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">Super Admin</div>
              <div className="text-[10px] text-gray-400">CheckSync Pro</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {ADMIN_NAV.map((item) => {
            const isActive = item.href === '/admin'
              ? pathname === '/admin'
              : pathname?.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100/70'
                }`}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
                {isActive && <ChevronRight size={12} className="ml-auto text-blue-400" />}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-100/80 p-4 space-y-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-3 py-2 text-[13px] font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-all"
          >
            <ArrowLeft size={14} />
            <span>Back to App</span>
          </Link>
          <div className="px-3 text-[10px] text-gray-400 truncate">{userEmail}</div>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-200/60 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown size={16} className="text-amber-500" />
          <span className="text-sm font-bold text-gray-900">Admin</span>
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
                className={`p-2 rounded-lg transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-400'
                }`}
              >
                <item.icon size={16} />
              </Link>
            );
          })}
          <Link href="/dashboard" className="p-2 rounded-lg text-blue-600">
            <ArrowLeft size={16} />
          </Link>
        </div>
      </div>

      {/* Main */}
      <main className="flex-1 md:ml-[240px] mt-14 md:mt-0 min-h-screen">
        {children}
      </main>
    </div>
  );
}
