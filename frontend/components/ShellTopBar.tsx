'use client';

import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { Upload } from 'lucide-react';

/**
 * The app's top bar, and the home of BOTH switchers (CHECKLIST section 4).
 *
 * They used to sit stacked in the sidebar, which is the wrong place for them:
 * they are not navigation, they are the scope that every page is read through,
 * and in the sidebar the company name was clipped to a 240px column.
 *
 * This is the ONE blurred chrome in the main column (tier 4, `glass-chrome`),
 * which is why the popovers the switchers open are opaque — never nest two
 * blurred surfaces. It also absorbs the old mobile-only header, so there is
 * one bar at every width rather than two different ones.
 *
 * Both switchers are client-only: they read a Supabase session, so rendering
 * them on the server produces a flash of "no company".
 */
const CompanySwitcher = dynamic(() => import('@/components/CompanySwitcher'), { ssr: false });
const AccountSwitcher = dynamic(() => import('@/components/AccountSwitcher'), { ssr: false });

export default function ShellTopBar() {
  return (
    <header className="sticky top-0 z-40 glass-chrome border-b">
      {/* min-w-0 + flex-wrap: at 400px the two triggers wrap rather than
          pushing the bar wider than the viewport. */}
      <div className="flex min-w-0 items-center gap-2 px-4 py-2.5">
        {/* The sidebar is hidden under md, so the wordmark lives here there. */}
        <Link
          href="/reconcile"
          className="md:hidden mr-1 flex shrink-0 items-center gap-2 text-[15px] font-semibold text-ink-strong"
        >
          <Image
            src="/Kyriq_Logo_Files/kyriq-icon.svg"
            alt="Kyriq"
            width={24}
            height={24}
            className="rounded-md"
          />
        </Link>

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <CompanySwitcher />
          <AccountSwitcher />
        </div>

        <Link
          href="/upload"
          aria-label="Upload cheques"
          className="md:hidden shrink-0 rounded-input bg-primary-bg p-1.5 press"
        >
          <Upload aria-hidden className="h-4 w-4 text-primary-text" />
        </Link>
      </div>
    </header>
  );
}
