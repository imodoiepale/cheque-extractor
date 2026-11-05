'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import UserProfile from '@/components/UserProfile';
import QBProviderWrapper from '@/components/QBProviderWrapper';
import ShellTopBar from '@/components/ShellTopBar';
import SuperAdminLink from '@/components/SuperAdminLink';
import { NAV_GROUPS, activeNavHref } from '@/lib/shell-nav';
import { SUPPORT_MAILTO } from '@/lib/support';
import { LifeBuoy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { apiFetch, makeAppQueryClient, qk } from '@/lib/queries';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeTable';
import { createClient } from '@/lib/supabase/client';
import { isPlanTier } from '@/lib/pricing';

/** App-wide live refresh: job rows and QB connections, one socket topic each. */
function LiveSync() {
  const router = useRouter();
  useRealtimeInvalidate('check_jobs', undefined, [qk.jobs]);
  useRealtimeInvalidate('qb_connections', undefined, [qk.qbConnections]);
  // Signed up to pay rather than trial: Billing starts checkout and clears this.
  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (isPlanTier(session?.user?.user_metadata?.subscribe_plan)) router.replace('/billing');
    }).catch(() => {});
  }, [router]);
  // Welcome email on first sign-in instead of the next daily cron. Server-side
  // sends are keyed once per firm, so the flag only saves a request.
  useEffect(() => {
    try { if (localStorage.getItem('kyriq-welcome-sent')) return; } catch {}
    apiFetch('/api/email/welcome', { method: 'POST' })
      .then(() => { try { localStorage.setItem('kyriq-welcome-sent', '1'); } catch {} })
      .catch(() => {});
  }, []);
  return null;
}

/**
 * The app shell.
 *
 * A client component, which is the point: it was a server component with no
 * `pathname`, so the `.sidebar-item.active` recipe in globals.css had nothing
 * to switch on and no nav row ever read as current. Route protection is still
 * handled by proxy.ts — nothing about auth moved here.
 *
 * The rows themselves live in lib/shell-nav.ts.
 */
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
  const pathname = usePathname();
  // One cache per browser tab, created once (not per render).
  const [queryClient] = useState(makeAppQueryClient);

  // The longest href that matches is the one row that gets `active`; otherwise
  // /settings and /settings/team would both be highlighted at once.
  const bestMatch = activeNavHref(pathname);

  // Route protection is handled by proxy.ts
  return (
    <QueryClientProvider client={queryClient}>
    <LiveSync />
    <QBProviderWrapper>
      {/* No background of its own: the shell and the pages sit over the
          ambient mesh mounted in app/layout.tsx. Glass needs something to
          refract, painting a flat hex here is what made it read as grey. */}
      <div data-skin="glass" className="min-h-screen flex">
        {/* Shell chrome: dark true glass, heaviest blur tier. Nothing inside
            it may carry a backdrop-filter of its own (rule 2). */}
        <aside className="w-60 glass-shell border-r text-shell-text hidden md:flex flex-col fixed left-0 top-0 h-screen">
          <div className="px-5 py-5 border-b border-glass-hairline-dark flex-shrink-0">
            <Link href="/reconcile" className="flex items-center gap-2.5 font-semibold text-[15px] text-shell-text">
              <span className="inline-flex rounded-lg bg-white px-2.5 py-1.5 shadow-sm">
                <Image src="/brand/kyriq-logo.svg" alt="Kyriq" width={73} height={30} priority />
              </span>
            </Link>
          </div>

          {/* Scrolls inside the fixed shell, so the page itself still has
              exactly one scrollbar. */}
          <nav className="flex-1 px-3 py-3 space-y-0.5 scroll-region">
            {NAV_GROUPS.map((group, gi) => (
              <div key={group.label || 'main'} className={gi > 0 ? 'pt-2' : undefined}>
                {group.label ? (
                  <p className="px-2.5 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-shell-muted/70">
                    {group.label}
                  </p>
                ) : null}
                {group.items.map(item => {
                  const active = item.href === bestMatch;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`sidebar-item ${active ? 'active' : ''} ${SHELL_NAV_ROW}`}
                    >
                      <item.icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}

            <div className="my-2 border-t border-glass-hairline-dark" />

            {/* The in-app way to reach support (Intuit asks for one). A plain mailto: no widget, no account. */}
            <a href={SUPPORT_MAILTO} className={`sidebar-item ${SHELL_NAV_ROW}`}>
              <LifeBuoy className="w-4 h-4" />
              <span>Help &amp; support</span>
            </a>

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
          {/* Both switchers live here now, not in the sidebar. This is the
              only blurred chrome in the main column, which is why the
              popovers they open are opaque (rule 2). It also absorbs the old
              mobile-only header, so there is one bar at every width. */}
          <ShellTopBar />

          {children}
        </main>
      </div>
    </QBProviderWrapper>
    </QueryClientProvider>
  );
}
