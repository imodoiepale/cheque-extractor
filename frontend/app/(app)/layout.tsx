'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import UserProfile from '@/components/UserProfile';
import QBProviderWrapper from '@/components/QBProviderWrapper';
import ShellTopBar from '@/components/ShellTopBar';
import SuperAdminLink from '@/components/SuperAdminLink';
import { NAV_GROUPS, activeNavHref } from '@/lib/shell-nav';

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

  // The longest href that matches is the one row that gets `active`; otherwise
  // /settings and /settings/team would both be highlighted at once.
  const bestMatch = activeNavHref(pathname);

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
            <Link href="/reconcile" className="flex items-center gap-2.5 font-semibold text-[15px] text-shell-text">
              <Image src="/brand/kyriq-logo-white.svg" alt="Kyriq" width={92} height={38} priority />
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
  );
}
