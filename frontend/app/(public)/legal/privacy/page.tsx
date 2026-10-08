import { redirect } from 'next/navigation';

/**
 * Duplicate resolved (CHECKLIST 2.4) — see the sibling terms redirect.
 * `(public)/privacy` is the canonical, Kyriq-branded Privacy Policy.
 */
export default function LegalPrivacyRedirect() {
  redirect('/privacy');
}
