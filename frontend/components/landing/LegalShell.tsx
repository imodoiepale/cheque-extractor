/**
 * The chrome and typography for the public legal pages.
 *
 * It existed three times (privacy, terms, EULA), each with its own `<nav>`,
 * its own prose recipe and its own grey scale — which is how one of them ends
 * up a different page from the other two. One shell, one prose recipe, tokens
 * only. Prose styling is applied with arbitrary variants on the wrapper so
 * the page bodies stay plain semantic HTML with no per-element classes to
 * drift.
 *
 * Long documents, so the page itself scrolls — nothing here is a scroll
 * container, which keeps one scrollbar per page.
 */
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { KyriqLogo } from './KyriqMark';

/** One prose recipe for all three documents. Body text at full strength. */
const PROSE = [
  'max-w-none text-[15px] leading-relaxed text-ink-body',
  '[&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink-strong [&_h2]:mt-8 [&_h2]:mb-3',
  '[&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink-strong [&_h3]:mt-6 [&_h3]:mb-2',
  '[&_p]:text-ink-body [&_p]:leading-relaxed [&_p]:mb-4',
  '[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-4 [&_ul]:space-y-2 [&_ul]:text-ink-body',
  '[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-4 [&_ol]:space-y-2 [&_ol]:text-ink-body',
  '[&_li]:leading-relaxed',
  '[&_strong]:text-ink-strong [&_strong]:font-semibold',
  '[&_a]:text-brand-deep [&_a]:underline [&_a]:underline-offset-2',
  '[&_table]:w-full [&_table]:text-sm [&_th]:text-left [&_th]:text-ink-strong [&_th]:font-semibold',
  '[&_section]:mb-2',
].join(' ');

export function LegalShell({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <nav className="glass-chrome border-b px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <KyriqLogo height={30} />
          </Link>
          <Link
            href="/"
            className="press text-sm text-ink-soft hover:text-ink-strong flex items-center gap-1.5 rounded-pill px-2 py-1"
          >
            <ArrowLeft size={14} aria-hidden /> Back to home
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="animate-glass-rise glass-card rounded-card p-6 sm:p-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-ink-strong tracking-[-0.025em] mb-2">{title}</h1>
          <p className="text-sm text-ink-faint mb-10">Last updated: {updated}</p>
          <div className={PROSE}>{children}</div>
        </div>
      </main>
    </div>
  );
}

export default LegalShell;
