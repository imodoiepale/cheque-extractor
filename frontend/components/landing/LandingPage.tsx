'use client';

/**
 * Kyriq landing page — parcel I.
 *
 * Two things govern this file:
 *
 * 1. CHECKLIST 12. The fabricated social proof is gone (watch-demo button,
 *    "trusted by 500+ accounting firms", every testimonial), every CTA reads
 *    "Start Free Trial" and routes to /signup, the hero leads with the bank
 *    statement, and pricing is the Starter / Professional / Firm table
 *    with the monthly-annual toggle, overage rates and annual terms.
 *
 * 2. DESIGN-SYSTEM. Colour comes from tokens only — no hex, no raw Tailwind
 *    palette class. Entrances are CSS keyframes (`animate-glass-rise` +
 *    `.stagger`), never JS tweens, because requestAnimationFrame is frozen in
 *    a hidden document and a framer-motion entrance can land mid-tween and
 *    stick. framer-motion is kept only where the motion is genuinely
 *    interactive — the mobile menu and the carousel — and both consult
 *    `useReducedMotion()`, which Parcel A's CSS media query cannot reach.
 *
 * scripts/check-landing.ts fails if any of that regresses.
 */

import { createClient } from '@/lib/supabase/client';
import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Users, ArrowRight, Upload, Search, Mic, ShieldCheck,
  X, Menu, Check, ScanLine, GitCompare, ClipboardCheck, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui';
import { KyriqIconWhite, KyriqLogo } from './KyriqMark';
import { WaitlistForm } from './WaitlistForm';
// Rise is the ON-MOUNT entrance used above the fold. Reveal is the
// ON-SCROLL one for everything below it, where a mount-time keyframe has
// already finished by the time the reader arrives.
import { Reveal, useScrollReveals } from './Reveal';
// Plans live in lib/pricing.ts so the admin dashboards can import the same
// numbers. They used to exist only here, which is why the admin console was
// still quoting DepthMe's consumer prices.
import { PLANS, INCLUDED_IN_EVERY_PLAN } from '@/lib/pricing';
// The approved 15 FAQ pairs. Shared with the FAQPage JSON-LD in app/page.tsx.
import { FAQS } from '@/lib/marketing/faqs';
import { NumberTicker } from '@/components/ui/number-ticker';
import { BorderBeam } from '@/components/ui/border-beam';
import { ShimmerButton } from '@/components/ui/shimmer-button';

/* =========================================================================
   COPY. Customer-facing wording is from the client's approved redesign site
   (kyriq-website-redesign, Sep 2026): hero, workflow, firm points, pricing
   notes and the 15 FAQ pairs. The look follows the Kyriq asset pack: light
   glass, indigo/emerald orbs, a dark facts band and a dark closing banner.
   ========================================================================= */

/** The single CTA label and destination. Both are asserted by the check. */
const CTA_LABEL = 'Start Free Trial';
const CTA_HREF = '/signup';
/** Chrome Web Store listing. Unset until the extension is published, so the button stays hidden. */
// The published store listing; the env var can still override it.
const EXTENSION_URL =
  process.env.NEXT_PUBLIC_CHROME_EXTENSION_URL ||
  'https://chromewebstore.google.com/detail/apnglhjejjghgmcinkoeganejmkjmkpk';
const TRIAL_TERMS = '14-day trial or 250 processed checks, whichever comes first · No credit card required';
const HERO_ASSURANCES = ['No credit card required', 'Setup in minutes', 'Human approval always required'];

/**
 * Entrance. CSS keyframes, not a JS tween — see the file header. `.stagger`
 * caps the delay at the fifth child so a long list never makes the reader
 * wait, and `prefers-reduced-motion` retargets glass-rise to a short fade in
 * globals.css, so there is nothing to branch on here.
 */
function Rise({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('animate-glass-rise', className)}>{children}</div>;
}

/** The one primary action on the page. Anchor, so it is crawlable. */
function CtaLink({ className, size = 'lg' }: { className?: string; size?: 'md' | 'lg' }) {
  return (
    <Link href={CTA_HREF} className={cn(buttonVariants({ variant: 'primary', size }), className)}>
      {CTA_LABEL} <ArrowRight size={16} aria-hidden />
    </Link>
  );
}

// Root-relative so the same nav works on the SEO pages (app/(marketing)),
// and real URLs where a page exists, so crawlers can follow them.
const NAV_LINKS = [
  { label: 'How It Works', href: '/#how' },
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Guides', href: '/guides' },
  { label: 'FAQs', href: '/#faq' },
];

/** Signed in already? Read from the local session: no network call. */
function useSignedIn() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let alive = true;
    createClient().auth.getSession().then(({ data }) => { if (alive) setSignedIn(!!data.session); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return signedIn;
}

export function Nav() {
  const signedIn = useSignedIn();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <nav
      className={cn(
        'fixed top-0 inset-x-0 z-50 transition-[background-color,box-shadow,border-color] duration-settle ease-settle',
        scrolled ? 'glass-chrome border-b shadow-contact' : 'border-b border-transparent'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-14">
        <Link href="/" className="flex items-center gap-2.5">
          <KyriqLogo height={34} />
        </Link>

        <div className="hidden lg:flex items-center gap-8">
          {NAV_LINKS.map((l) => (
            <a key={l.href} href={l.href} className="text-[13px] font-medium text-ink-faint hover:text-ink-strong transition-colors duration-quick">
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden lg:flex items-center gap-3">
          {signedIn ? (
            <Link href="/dashboard" className={cn(buttonVariants({ size: 'md' }), 'px-5 min-h-tap text-[13px]')}>
              Go to app
            </Link>
          ) : (
            <>
              <Link href="/login" className="text-[13px] font-medium text-brand-deep hover:text-brand-dark transition-colors duration-quick">
                Sign in
              </Link>
              <CtaLink size="md" className="px-5 min-h-tap text-[13px]" />
            </>
          )}
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="lg:hidden press rounded-input p-2 text-ink-body hover:bg-ink-strong/[0.06]"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Interactive motion, so framer-motion earns its place here — but the
          height tween is dropped outright when reduced motion is requested. */}
      <AnimatePresence initial={false}>
        {mobileOpen && (
          <motion.div
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduced ? 0.16 : 0.28, ease: [0.23, 1, 0.32, 1] }}
            className="lg:hidden overflow-hidden glass-modal border-t"
          >
            <div className="px-4 py-4 space-y-1">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="block px-4 py-3 text-base font-medium text-ink-body rounded-input hover:bg-brand-wash hover:text-brand-deep transition-colors duration-quick"
                >
                  {l.label}
                </a>
              ))}
              <div className="pt-4 mt-2 border-t hairline grid gap-3">
                {signedIn ? (
                  <Link href="/dashboard" onClick={() => setMobileOpen(false)} className={cn(buttonVariants({ size: 'md', block: true }))}>
                    Go to app
                  </Link>
                ) : (
                  <>
                    <CtaLink className="w-full" />
                    <Link
                      href="/login"
                      onClick={() => setMobileOpen(false)}
                      className={cn(buttonVariants({ variant: 'ghost', size: 'md', block: true }))}
                    >
                      Sign in
                    </Link>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}

/* ── Hero. Copy from the approved redesign (kyriq-website-redesign, Sep 2026). ── */
function Hero() {
  return (
    <section className="relative pt-28 sm:pt-36 lg:pt-44 pb-20 sm:pb-28 lg:pb-32 px-4 sm:px-6 overflow-hidden">
      <Image src="/landing/hero-match-sculpture-4k-v1.webp" alt="" fill priority sizes="100vw" className="object-cover object-[68%_center] sm:object-center opacity-60" aria-hidden />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-surface via-surface/90 to-surface/70 lg:bg-gradient-to-r lg:from-surface lg:via-surface/95 lg:to-surface/20" />

      <div className="relative max-w-7xl mx-auto grid grid-cols-1 gap-12 xl:gap-16">
        <div className="text-left">
          <Rise>
            <span className="inline-flex items-center gap-2 px-4 py-1.5 mb-7 rounded-full bg-surface/80 backdrop-blur-xl border border-brand-tint text-xs font-semibold text-brand-deep tracking-wide shadow-contact">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accentEmerald opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accentEmerald" />
              </span>
              Kyriq is the new standard for check reconciliation in QuickBooks Online
            </span>
          </Rise>

          <Rise>
            <h1 className="text-[clamp(2.75rem,4.4vw,4.25rem)] font-extrabold tracking-[-0.04em] leading-[0.98] text-ink-strong mb-7 max-w-[650px]">
              See every check.{' '}
              <span className="bg-gradient-to-r from-brand via-brand-light to-accentEmerald bg-clip-text text-transparent">
                Approve exact matches together.
              </span>
            </h1>
          </Rise>
          <Rise>
            <p className="text-[clamp(1rem,1.45vw,1.25rem)] text-ink-soft max-w-[620px] mb-10 leading-relaxed">
              Start with your bank statement. See every check matched against QuickBooks Online, approve exact
              matches together, and review discrepancies with confidence.
            </p>
          </Rise>

          <Rise>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-5">
              <CtaLink />
              <a href="#how" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}>
                See how it works
              </a>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs sm:text-[13px] text-ink-faint">
              {HERO_ASSURANCES.map((item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <Check size={14} className="text-brand" aria-hidden />
                  {item}
                </span>
              ))}
            </div>
          </Rise>
        </div>

        <Rise>
          <div className="relative rounded-card">
            <div aria-hidden className="absolute -inset-8 rounded-modal bg-brand/10 blur-3xl" />
            <BorderBeam size={300} duration={12} />
            <div tabIndex={0} aria-label="Screenshot of the Kyriq QuickBooks comparisons page" className="relative rounded-card overflow-x-auto shadow-glass-modal border border-glass-hairline bg-surface">
              {/* Wide table: phones scroll it sideways so the text stays readable. */}
              <Image
                src="/landing/quickbooks-comparisons-real.webp"
                alt="The Kyriq QuickBooks comparisons page, showing 15 uploaded checks compared with QuickBooks: 14 matched and 1 mismatch, each with Approve and Review actions"
                width={2376}
                height={1062}
                priority
                sizes="(max-width: 1280px) 100vw, 1280px"
                className="block h-auto w-full min-w-[820px]"
              />
            </div>
          </div>
        </Rise>
      </div>
    </section>
  );
}

/**
 * The facts band. Every figure is a term of the offer, not a performance
 * claim, so the old "98% accuracy / 0 missed checks" bar stays gone.
 */
function FactsBar() {
  const facts: { value?: number; text?: string; suffix?: string; label: string }[] = [
    { value: 14, suffix: ' days', label: 'Free trial, no card required' },
    { value: 250, label: 'Checks included in the trial' },
    { text: 'Unlimited', label: 'Companies and users on every plan' },
    { value: 0, label: 'Checks cleared without your approval' },
  ];
  return (
    <section className="bg-shell-solid py-8 sm:py-12">
      <div data-reveal className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-y-7 lg:gap-y-0 px-4 sm:px-6 stagger reveal-children">
        {facts.map((s, i) => (
          <div key={s.label} className={cn('animate-glass-rise text-center px-3 sm:px-5', i < 3 && 'lg:border-r lg:border-glass-hairline-dark')}>
            <div className="text-3xl sm:text-4xl font-extrabold text-shell-text tracking-[-0.025em] mb-1 nums">
              <span className="text-accentEmerald">{s.text ?? <NumberTicker value={s.value ?? 0} />}</span>
              {s.suffix}
            </div>
            <div className="text-[13px] text-shell-muted">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SectionHead({ eyebrow, title, blurb, dark }: { eyebrow: string; title: string; blurb?: string; dark?: boolean }) {
  return (
    <Reveal className="text-center mb-10 sm:mb-14 lg:mb-16 max-w-4xl mx-auto">
      <span className={cn('text-eyebrow mb-3 block', dark ? 'text-accentEmerald' : 'text-brand')}>{eyebrow}</span>
      <h2 className={cn('text-[clamp(2rem,4vw,3.25rem)] font-extrabold tracking-[-0.025em] leading-[1.08] mb-5', dark ? 'text-shell-text' : 'text-ink-strong')}>
        {title}
      </h2>
      {blurb && <p className={cn('text-[clamp(1rem,1.35vw,1.125rem)] max-w-[560px] mx-auto leading-relaxed', dark ? 'text-shell-muted' : 'text-ink-soft')}>{blurb}</p>}
    </Reveal>
  );
}

function SectionBackdrop({ src, opacity = 'opacity-75' }: { src: string; opacity?: string }) {
  return (
    <>
      <Image src={src} alt="" fill sizes="100vw" className={cn('object-cover object-center opacity-50 sm:opacity-65 lg:opacity-75', opacity)} aria-hidden />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-surface/35 via-transparent to-surface/50" />
    </>
  );
}

function HowItWorks() {
  const steps = [
    {
      num: '01', label: 'Upload', icon: <Upload className="w-5 h-5" />,
      title: 'Upload your bank statement',
      desc: 'Upload the bank statement PDF you already download and Kyriq extracts the checks for you. Typed or handwritten check images work too, in PDF, JPG, or PNG.',
    },
    {
      num: '02', label: 'Compare', icon: <GitCompare className="w-5 h-5" />,
      title: 'Match every check',
      desc: 'Kyriq compares each processed check with the selected QuickBooks register and scores every match.',
    },
    {
      num: '03', label: 'Review', icon: <Search className="w-5 h-5" />,
      title: 'Review every result',
      desc: 'See the complete batch, then review lower-confidence matches, possible duplicates, and discrepancies individually.',
    },
    {
      num: '04', label: 'Approve', icon: <ClipboardCheck className="w-5 h-5" />,
      title: 'Clear approved checks',
      desc: 'Approve all 100% matches together. Approved checks are cleared in your QuickBooks reconciliation.',
    },
  ];
  return (
    <section id="how" className="relative py-20 sm:py-28 lg:py-36 px-4 sm:px-6 overflow-hidden">
      <SectionBackdrop src="/landing/workflow-background-4k-v1.webp" />
      <div className="relative max-w-7xl mx-auto">
        <SectionHead
          eyebrow="One clear workflow"
          title="From your bank statement to a completed QuickBooks reconciliation"
        />
        <div data-reveal className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-5 lg:gap-6 relative stagger reveal-children">
          <div className="hidden lg:block absolute top-[38px] left-[10%] w-[80%] h-px bg-gradient-to-r from-transparent via-brand to-transparent opacity-30" aria-hidden />
          {steps.map((s) => (
            <div key={s.num} className="animate-glass-rise bg-surface/85 backdrop-blur-xl border border-glass-hairline shadow-glass rounded-card p-6 sm:p-7 lg:p-8 relative min-h-[220px] xl:min-h-[260px]">
              <div className="flex items-center gap-3 mb-5">
                <span className="w-11 h-11 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white shadow-brand-glow relative z-10">
                  {s.icon}
                </span>
                <span className="text-eyebrow text-brand">{s.num} · {s.label}</span>
              </div>
              <h3 className="text-[16px] font-bold tracking-display text-ink-strong mb-2">{s.title}</h3>
              <p className="text-[13px] text-ink-body leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BuiltForFirms() {
  const points = [
    {
      icon: <FileText className="w-5 h-5" />,
      title: 'One upload instead of two',
      desc: 'Use the bank statement you already have. Kyriq extracts the checks directly, so there is no separate extraction software and no re-upload step.',
      tone: 'bg-gradient-to-br from-brand to-brand-dark',
    },
    {
      icon: <ScanLine className="w-5 h-5" />,
      title: 'Typed or handwritten',
      desc: 'Kyriq reads both. Extracted details and confidence scores stay visible, so your team can verify anything that needs a closer look.',
      tone: 'bg-gradient-to-br from-accentEmerald to-accentEmerald-dark',
    },
    {
      icon: <ShieldCheck className="w-5 h-5" />,
      title: 'Your team controls approval',
      desc: 'Nothing is cleared automatically. An authorized user approves the result first, and every decision is logged.',
      tone: 'bg-gradient-to-br from-brand-dark to-brand-deep',
    },
    {
      icon: <Users className="w-5 h-5" />,
      title: 'Unlimited companies and users',
      desc: 'Pricing is based on processed-check volume, not the number of QuickBooks companies or team members.',
      tone: 'bg-gradient-to-br from-brand-light to-brand',
    },
  ];
  return (
    <section id="features" className="relative py-20 sm:py-28 lg:py-36 px-4 sm:px-6 overflow-hidden">
      <SectionBackdrop src="/landing/firms-background-4k-v1.webp" opacity="opacity-70" />
      <div className="relative max-w-7xl mx-auto grid lg:grid-cols-[0.9fr_1.1fr] gap-12 lg:gap-20 items-center">
        <div>
          <span className="text-eyebrow text-brand mb-4 block">Built for firms</span>
          <h2 className="text-[clamp(2.5rem,5vw,3.75rem)] font-extrabold tracking-[-0.035em] leading-[1.04] text-ink-strong mb-6">
            Built for bookkeeping and accounting firms
          </h2>
          <p className="text-[clamp(1rem,1.35vw,1.2rem)] text-ink-soft leading-relaxed max-w-[560px] mb-10">
            Spend less time checking transactions one by one. Kyriq organizes the full batch by match result, so judgment goes where it is needed.
          </p>
          <div data-reveal className="relative aspect-[4/3] sm:aspect-[3/2] max-w-[620px] overflow-hidden rounded-modal border border-glass-hairline bg-shell-solid shadow-glass-modal">
            <Image src="/landing/statement-to-quickbooks-kyriq-v6.webp" alt="Bank statements transformed into matched QuickBooks records through Kyriq" fill sizes="(max-width: 1024px) 100vw, 48vw" className="object-cover object-center" />
          </div>
        </div>
        <div data-reveal className="grid sm:grid-cols-2 gap-5 stagger reveal-children">
          {points.map((f) => (
            <div key={f.title} className="animate-glass-rise bg-surface/88 backdrop-blur-xl border border-glass-hairline shadow-glass rounded-card p-6 sm:p-8 hover-lift min-h-[210px] sm:min-h-[230px]">
              <div className={cn('w-12 h-12 rounded-input flex items-center justify-center text-white mb-6 sm:mb-8', f.tone)}>{f.icon}</div>
              <h3 className="text-lg font-bold tracking-display text-ink-strong mb-3">{f.title}</h3>
              <p className="text-sm text-ink-body leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ExtensionSection() {
  return (
    <section id="extension" className="relative py-20 sm:py-28 lg:py-36 px-4 sm:px-6 bg-shell-solid overflow-hidden">
      <div className="relative max-w-7xl mx-auto grid lg:grid-cols-[0.72fr_1.28fr] gap-10 lg:gap-16 items-center">
        <div>
          <span className="text-eyebrow text-accentEmerald mb-4 block">Chrome extension</span>
          <h2 className="text-[clamp(2.5rem,5vw,3.75rem)] font-extrabold tracking-[-0.035em] leading-[1.04] text-shell-text mb-6">
            Works right inside QuickBooks
          </h2>
          <p className="text-[clamp(1rem,1.35vw,1.2rem)] text-shell-muted leading-relaxed mb-9">
            Approve and clear matched checks without leaving QuickBooks Online. The Kyriq Chrome extension is included with every plan and during the trial.
          </p>
          <ul className="space-y-4 text-sm text-shell-text">
            {['Reconcile without leaving QuickBooks', 'View match suggestions in context', 'Approve or flag each result yourself', 'Keep every approval in the audit trail'].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center"><Check size={13} className="text-accentEmerald" aria-hidden /></span>
                {item}
              </li>
            ))}
          </ul>
          {EXTENSION_URL && (
            <a href={EXTENSION_URL} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants({ variant: 'primary', size: 'lg' }), 'mt-9')}>
              Add to Chrome <ArrowRight size={16} aria-hidden />
            </a>
          )}
        </div>
        <div data-reveal className="relative aspect-[4/3] sm:aspect-video overflow-hidden rounded-modal border border-glass-hairline-dark bg-surface shadow-glass-modal">
          <Image src="/landing/quickbooks-extension-4k-v1.webp" alt="Kyriq Chrome extension reviewing suggested matches inside QuickBooks Online" fill sizes="(max-width: 1024px) 100vw, 60vw" className="object-contain object-center contrast-[1.05] saturate-[0.9]" />
        </div>
      </div>
    </section>
  );
}

/** Michael's approved examples, verbatim. Do not paraphrase these. */
const VOICE_PROMPTS = [
  'What needs my attention before I complete this reconciliation?',
  'Why was check #1047 marked as a mismatch?',
  'Show me every payment made to ABC Supply across all my companies this year.',
  'Which checks are ready for approval, and which ones should I review first?',
];

/** Kyriq IQ teaser. The working beta lives at /voice for signed-in firms, and is
 *  still called Voice there — Michael renamed the public-facing section only. */
function VoiceSection() {
  // White section, two columns. Left: the artwork as a wide rectangle with the
  // voice-prompts card under it. Right: the pitch + waitlist as one tall card
  // the height of the left stack.
  const NAVY_CARD =
    'rounded-modal border border-white/10 bg-[rgb(14,15,44)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_30px_70px_-30px_rgba(30,27,75,0.55)]';
  return (
    <section id="voice" className="relative overflow-hidden bg-white px-4 py-20 sm:px-6 sm:py-28 lg:py-32">
      <div className="relative mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.25fr_1fr] lg:gap-8">
        <div className="flex flex-col gap-6 lg:gap-8">
          <div className="relative aspect-[16/9] overflow-hidden rounded-modal shadow-[0_30px_70px_-30px_rgba(30,27,75,0.55)] ring-1 ring-ink-strong/5">
            <Image
              src="/landing/kyriq-iq-characters-user-v1.webp"
              alt="Kyriq and QuickBooks reconciling cheques side by side"
              fill
              sizes="(min-width: 1024px) 55vw, 100vw"
              className="object-cover object-center"
            />
          </div>

          <div className={cn(NAVY_CARD, 'p-5 sm:p-6')}>
            <div className="mb-4 flex h-10 items-end justify-center gap-1" aria-hidden>
              {[28, 44, 60, 36, 52, 64, 40, 56, 30, 48, 62, 34, 50, 26].map((h, i) => (
                <span key={i} className="w-1.5 animate-pulse rounded-full bg-gradient-to-t from-brand to-accentEmerald" style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }} />
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {VOICE_PROMPTS.map((p) => (
                <div key={p} className="flex items-start gap-3 rounded-input border border-white/[0.06] bg-white/[0.06] px-4 py-3 text-[13px] leading-relaxed text-white/90">
                  <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accentEmerald" aria-hidden />
                  &ldquo;{p}&rdquo;
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={cn(NAVY_CARD, 'flex flex-col justify-center p-7 sm:p-10')}>
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-[11px] font-semibold uppercase tracking-eyebrow text-accentEmerald">
            <KyriqIconWhite size={15} /> <Mic className="h-3.5 w-3.5" aria-hidden /> Kyriq IQ · Coming soon
          </span>
          <h2 className="mb-5 text-[clamp(1.875rem,2.8vw,3rem)] font-bold leading-[1.05] tracking-[-0.03em] text-white">
            Ask. Review. Act, 
            <span className="bg-gradient-to-r from-brand-light to-accentEmerald bg-clip-text text-transparent">with your approval.</span>
          </h2>
          <p className="mb-3 text-[clamp(1.05rem,1.3vw,1.2rem)] leading-relaxed text-white/85">
            Kyriq IQ brings conversational intelligence to reconciliation.
          </p>
          <p className="mb-5 text-[15px] leading-relaxed text-shell-muted">
            Talk to Kyriq like a colleague. Ask what needs attention, have any check read back to you, or find every payment made to a vendor. Kyriq IQ works from your firm&apos;s own data, recognizes your companies and payees, and keeps you in control of every action.
          </p>
          <p className="mb-7 text-[13px] text-shell-muted/80">Starting with checks. Full-book reconciliation is next.</p>
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   Pricing. The numbers themselves now live in lib/pricing.ts, which is also
   what the admin dashboards import and what scripts/check-landing.ts asserts
   against. This section only renders them. The local Plan type that used to
   sit here went with them.
   ========================================================================= */



export function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="relative py-20 sm:py-28 lg:py-36 px-4 sm:px-6 overflow-hidden">
      <SectionBackdrop src="/landing/pricing-background-4k-v1.webp" opacity="opacity-80" />
      <div className="relative max-w-7xl mx-auto">
        <SectionHead
          eyebrow="Simple, flexible pricing"
          title="Choose monthly flexibility or save one month with an annual commitment"
          blurb="Every Kyriq plan includes the web app and the Chrome extension at no additional cost."
        />

        {/* Monthly / annual toggle. One recessed track, no per-item borders. */}
        <div className="flex justify-center mb-10">
          <div className="glass-track rounded-pill p-1 inline-flex" role="group" aria-label="Billing period">
            {[
              { label: 'Monthly', value: false },
              { label: 'Annual · one month free', value: true },
            ].map((opt) => (
              <button
                key={opt.label}
                onClick={() => setAnnual(opt.value)}
                aria-pressed={annual === opt.value}
                className={cn(
                  'press rounded-pill px-5 py-2 text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-quick ease-settle',
                  annual === opt.value ? 'bg-surface text-ink-strong shadow-contact' : 'text-ink-soft hover:text-ink-strong'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div data-reveal className="grid md:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-8 stagger items-stretch reveal-children">
          {PLANS.map((p) => (
            <div
              key={p.tier}
              className={cn(
                'animate-glass-rise relative rounded-card p-6 sm:p-8 lg:p-10 h-full flex flex-col min-h-[540px] lg:min-h-[590px]',
                p.popular ? 'bg-shell-solid text-shell-text shadow-brand-glow md:-translate-y-4' : 'bg-surface/90 backdrop-blur-xl border border-glass-hairline shadow-glass'
              )}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-brand to-brand-dark text-white text-[10px] font-bold uppercase tracking-eyebrow px-4 py-1 rounded-full whitespace-nowrap">
                  Most Popular
                </span>
              )}

              <div className={cn('text-eyebrow mb-2', p.popular ? 'text-accentEmerald' : 'text-brand')}>{p.name}</div>

                <div className={cn('text-[clamp(2.5rem,4vw,3rem)] font-extrabold tracking-[-0.025em] leading-none mb-1 nums', p.popular ? 'text-shell-text' : 'text-ink-strong')}>
                <sup className="text-xl font-bold align-super">$</sup>
                {annual ? p.annual.toLocaleString('en-US') : p.monthly}
              </div>
              <div className={cn('text-[13px] mb-2', p.popular ? 'text-shell-muted' : 'text-ink-faint')}>
                {annual ? 'per year, one month free' : 'per month'}
              </div>

              <div className={cn('text-xs font-semibold mb-6 pb-6 border-b', p.popular ? 'text-accentEmerald border-glass-hairline-dark' : 'text-success-text border-glass-hairline')}>
                {p.allowance.toLocaleString('en-US')} checks / month
                <span className={cn('block font-normal mt-1', p.popular ? 'text-shell-muted' : 'text-ink-faint')}>
                  then ${p.overage} per check
                </span>
              </div>

              <ul className="space-y-2.5 mb-8 flex-1">
                {[...INCLUDED_IN_EVERY_PLAN, ...(p.extra ? [p.extra] : [])].map((f) => (
                  <li key={f} className={cn('flex items-start gap-2.5 text-[13px]', p.popular ? 'text-shell-text' : 'text-ink-body')}>
                    <span className={cn('mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0', p.popular ? 'bg-white/10' : 'bg-brand-wash')}>
                      <Check size={10} className={p.popular ? 'text-accentEmerald' : 'text-brand'} aria-hidden />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link href={CTA_HREF} className={cn(buttonVariants({ variant: 'primary', size: 'md', block: true }))}>
                {CTA_LABEL}
              </Link>
            </div>
          ))}
        </div>

        {/* Above the top plan's allowance, nobody should assume they are cut off. */}
        <p className="mt-8 text-center text-sm text-ink-soft">
          Reconciling more than 10,000 checks a month? Overage is {'$0.20'} per check on every plan, and{' '}
          <a href="mailto:support@kyriq.com?subject=Kyriq%20volume%20pricing" className="font-semibold text-brand-deep hover:text-brand-dark">
            contact us
          </a>{' '}
          for volume pricing above the Firm allowance.
        </p>

        {/* Trial, usage, overage and the annual terms, verbatim from the redesign. */}
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="glass-card rounded-card p-6">
            <h3 className="text-[15px] font-bold text-ink-strong mb-2">Trial and usage</h3>
            <p className="text-[13px] text-ink-body leading-relaxed">
              Try Kyriq for 14 days or process up to 250 checks, whichever comes first. No credit card is required.
              A check counts when it is processed from an upload. If the same check is uploaded and processed again, it
              counts again. After the monthly allowance ({PLANS.map((p) => p.allowance.toLocaleString('en-US')).join(' / ')} checks
              on Starter / Professional / Firm) is reached, additional checks are billed automatically at the overage
              rate shown for the plan. Usage resets at the beginning of each monthly billing cycle.
            </p>
          </div>
          <div className="glass-card rounded-card p-6">
            <h3 className="text-[15px] font-bold text-ink-strong mb-2">Annual plan terms</h3>
            <p className="text-[13px] text-ink-body leading-relaxed">
              Annual plans are prepaid 12-month commitments and include one month free. Monthly check allowances still
              reset each month, and overages are calculated and billed monthly. Cancel automatic renewal at any time;
              service continues through the paid-through date. Annual payments are non-refundable except where required
              by law or for duplicate, erroneous, or qualifying service-failure charges.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}


function Faq() {
  return (
    <section id="faq" className="relative py-20 sm:py-28 lg:py-36 px-4 sm:px-6 overflow-hidden">
      <SectionBackdrop src="/landing/faq-background-4k-v1.webp" opacity="opacity-75" />
      <div className="relative max-w-7xl mx-auto">
        <SectionHead
          eyebrow="Frequently asked questions"
          title="Everything you need to know before your first reconciliation"
          blurb="How Kyriq extracts checks from your bank statement, compares them with QuickBooks, manages approvals, and calculates plan usage."
        />
        <div className="grid xl:grid-cols-2 gap-4 items-start">
          {FAQS.map((item, i) => (
            // <details> rather than a JS accordion: keyboard and screen-reader
            // correct for free, and it works before hydration.
            <details key={item.q} open={i === 0} className="bg-surface/88 backdrop-blur-xl border border-glass-hairline shadow-contact rounded-card px-6 sm:px-7 py-6 group">
              <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-[15px] font-semibold text-ink-strong">
                {item.q}
                <span className="shrink-0 text-brand transition-transform duration-quick ease-settle group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-sm text-ink-body leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-ink-soft">
          Still have a question? Contact{' '}
          <a href="mailto:support@kyriq.com" className="font-semibold text-brand-deep hover:text-brand-dark">support@kyriq.com</a>.
        </p>
      </div>
    </section>
  );
}

function CTASection() {
  const router = useRouter();
  return (
    <section className="py-20 sm:py-28 px-4 sm:px-6 bg-surface">
      <div className="max-w-6xl mx-auto relative rounded-modal overflow-hidden animate-glass-rise bg-shell-solid flex items-center">
        <div className="relative w-full p-7 sm:p-16 md:p-24 text-center">
          <h2 className="relative text-[clamp(1.75rem,3.5vw,2.5rem)] font-extrabold text-shell-text tracking-[-0.025em] mb-4">
            Ready to reconcile checks in a fraction of the time?
          </h2>
          <p className="relative text-[clamp(0.875rem,1.3vw,1.125rem)] text-shell-muted mb-8 max-w-2xl mx-auto">
            See every processed check, approve all 100% matches together, and give lower-confidence matches,
            duplicates, and discrepancies the individual attention they need.
          </p>
          <div className="relative flex justify-center">
            {/* Magic-UI: shimmer-slide keyframe + --speed. A <button> that
                routes, not an anchor, because an <a> may not contain
                interactive content and ShimmerButton renders a <button>.
                The crawlable /signup anchors are the hero, nav and pricing. */}
            <ShimmerButton
              onClick={() => router.push(CTA_HREF)}
              className="min-h-btn px-8 text-[15px] font-semibold text-white shadow-brand-glow"
              background="linear-gradient(90deg, hsl(var(--brand)), hsl(var(--brand-dark)))"
            >
              Start Your Free Trial
              <ArrowRight size={16} className="ml-2" aria-hidden />
            </ShimmerButton>
          </div>
          <p className="relative mt-5 text-xs text-shell-muted">{TRIAL_TERMS}</p>
          <p className="relative mt-3 text-[13px] text-shell-muted">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-shell-text underline-offset-4 hover:underline">Sign in</Link>
          </p>
        </div>
        {/* Magic-UI: border-beam keyframe + --duration. */}
        <BorderBeam size={250} duration={10} />
      </div>
    </section>
  );
}

export function Footer() {
  // Every SEO page is reachable from here, so no page is an orphan.
  const footerCols: Record<string, { label: string; href: string }[]> = {
    Product: [
      { label: 'How it works', href: '/#how' },
      { label: 'Check reconciliation for QBO', href: '/features/check-reconciliation-quickbooks-online' },
      { label: 'Handwritten check OCR', href: '/features/handwritten-check-ocr' },
      { label: 'Bulk check processing', href: '/features/bulk-check-processing' },
      { label: 'Chrome extension', href: '/features/quickbooks-chrome-extension' },
      { label: 'Kyriq IQ', href: '/#voice' },
      { label: 'Pricing', href: '/pricing' },
    ],
    'Who it’s for': [
      { label: 'Accounting firms', href: '/for/accounting-firms' },
      { label: 'Bookkeepers', href: '/for/bookkeepers' },
      { label: 'Property management', href: '/for/property-management' },
      { label: 'Churches and nonprofits', href: '/for/churches-and-nonprofits' },
      { label: 'Construction', href: '/for/construction' },
      { label: 'Canada (cheques)', href: '/ca/cheque-reconciliation-quickbooks' },
      { label: 'United Kingdom (cheques)', href: '/uk/cheque-reconciliation-quickbooks' },
    ],
    Resources: [
      { label: 'QuickBooks guides', href: '/guides' },
      { label: 'Compare Kyriq', href: '/compare' },
      { label: 'MICR line decoder', href: '/tools/micr-line-decoder' },
      { label: 'Outstanding checks template', href: '/tools/outstanding-checks-template' },
      { label: 'FAQs', href: '/#faq' },
      { label: 'Support', href: '/support' },
    ],
    Account: [
      { label: CTA_LABEL, href: CTA_HREF },
      { label: 'Sign in', href: '/login' },
      { label: 'support@kyriq.com', href: 'mailto:support@kyriq.com' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'EULA', href: '/legal/eula' },
    ],
  };
  return (
    <footer className="bg-shell-solid px-6 sm:px-12">
      <div className="max-w-7xl mx-auto pt-16 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-[240px_1fr_1fr_1fr_1fr] gap-8 sm:gap-10 pb-12 border-b border-glass-hairline-dark">
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <KyriqLogo height={36} variant="white" />
            </div>
            <p className="text-[13px] text-shell-muted leading-relaxed">
              Check reconciliation for QuickBooks Online, built for bookkeeping and accounting firms.
            </p>
          </div>
          {Object.entries(footerCols).map(([title, links]) => (
            <div key={title}>
              <p className="text-eyebrow text-shell-muted mb-4">{title}</p>
              <div className="space-y-2.5">
                {links.map((l) => (
                  <a key={l.label} href={l.href} className="block text-[13px] text-shell-muted hover:text-shell-text transition-colors duration-quick">
                    {l.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row justify-between gap-2 pt-8 text-xs text-shell-muted">
          <span>&copy; 2026 Kyriq · QuickBooks check reconciliation</span>
          <div className="flex gap-5">
            <a href="/privacy" className="hover:text-shell-text transition-colors duration-quick">Privacy</a>
            <a href="/terms" className="hover:text-shell-text transition-colors duration-quick">Terms</a>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  // One observer for every [data-reveal] on the page. Marking a new section up
  // is then just the attribute — no wrapper, no import at the call site.
  useScrollReveals();

  // No `bg-*` on the root: the ambient mesh is mounted in the root layout and
  // sits at z-index -1, so an opaque page background would hide the thing the
  // glass is supposed to refract. One scrollbar — nothing here scrolls inside.
  return (
    <div className="min-h-screen text-ink-strong overflow-x-hidden">
      <Nav />
      <Hero />
      <FactsBar />
      <HowItWorks />
      <BuiltForFirms />
      <ExtensionSection />
      <VoiceSection />
      <Pricing />
      <Faq />
      <CTASection />
      <Footer />
    </div>
  );
}
