import { redirect } from 'next/navigation';

/**
 * Duplicate resolved (CHECKLIST 2.4). There were two Terms of Service pages:
 * this one, which still called the product "Cheque Extractor", and
 * `(public)/terms`, which is Kyriq-branded, is the one the footer links to,
 * and is the one named in the proxy's public-route allowlist. `(public)/terms`
 * therefore wins, and this path redirects rather than 404s so any link or
 * bookmark already in the wild still lands somewhere correct.
 */
export default function LegalTermsRedirect() {
  redirect('/terms');
}
