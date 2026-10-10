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

import { useState, useEffect, ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Users, ArrowRight, Upload, Search, Mic, ShieldCheck,
  X, Menu, Check, ScanLine, GitCompare, ClipboardCheck, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui';
import { KyriqIcon, KyriqIconWhite, KyriqLogo } from './KyriqMark';
import { Marquee } from '@/components/ui/marquee';
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
const TRIAL_TERMS = '14-day trial or 250 processed checks, whichever comes first · No credit card required';

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

const NAV_LINKS = [
  { label: 'How It Works', href: '#how' },
  { label: 'Extension', href: '#extension' },
  { label: 'Voice', href: '#voice' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQs', href: '#faq' },
];

function Nav() {
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
          <Link href="/login" className="text-[13px] font-medium text-brand-deep hover:text-brand-dark transition-colors duration-quick">
            Sign in
          </Link>
          <CtaLink size="md" className="px-5 min-h-tap text-[13px]" />
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
                <CtaLink className="w-full" />
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className={cn(buttonVariants({ variant: 'ghost', size: 'md', block: true }))}
                >
                  Sign in
                </Link>
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
    <section className="relative pt-28 sm:pt-36 lg:pt-40 pb-16 sm:pb-24 px-4 sm:px-6 overflow-hidden">
      {/* Glass orbs (asset pack 08). Token gradients only, decorative. */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_35%_35%,hsl(var(--brand-light)/0.55),hsl(var(--brand)/0.18)_55%,transparent_72%)] blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute top-40 -right-40 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle_at_60%_40%,hsl(var(--emerald)/0.28),hsl(var(--brand)/0.2)_50%,transparent_72%)] blur-2xl" />

      <div className="relative max-w-5xl mx-auto text-center">
        <Rise>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 sm:mb-8 rounded-full bg-brand-wash border border-brand-tint text-xs font-semibold text-brand-deep tracking-wide">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accentEmerald opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accentEmerald" />
            </span>
            The new standard for check reconciliation in QuickBooks Online
          </span>
        </Rise>

        <Rise>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[76px] font-extrabold tracking-[-0.03em] leading-[1.03] text-ink-strong mb-6">
            See every check.{' '}
            <span className="bg-gradient-to-r from-brand via-brand-light to-accentEmerald bg-clip-text text-transparent">
              Approve exact matches together.
            </span>
          </h1>
        </Rise>
        <Rise>
          <p className="text-base sm:text-lg md:text-xl text-ink-soft max-w-[680px] mx-auto mb-9 leading-relaxed px-2">
            Upload the bank statement you already download. Kyriq extracts every check, compares it with QuickBooks,
            and lets your team approve all 100% matches in one step, so review time goes to the checks that need judgment.
          </p>
        </Rise>

        <Rise>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4 px-4">
            <CtaLink />
            <a href="#how" className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }))}>
              See how it works
            </a>
          </div>
          <p className="text-xs sm:text-[13px] text-ink-faint mb-14 sm:mb-16 px-4">{TRIAL_TERMS}</p>
        </Rise>

        <Rise>
          <div className="max-w-[980px] mx-auto relative rounded-card">
            {/* Magic-UI: border-beam keyframe + --duration. */}
            <BorderBeam size={300} duration={12} />
            <div className="rounded-card overflow-hidden shadow-glass-modal border border-glass-hairline bg-surface">
              <MatchReviewMock />
            </div>
          </div>
        </Rise>
      </div>
    </section>
  );
}

/** The Match & Review screen from the redesign. A still, deliberately flat. */
function MatchReviewMock() {
  const rows = [
    { n: '1041', up: 'Northstar Office', upDate: '08/12/26', qb: 'Northstar Office', qbDate: '08/12/26', amt: '$1,284.60', score: 100 },
    { n: '1042', up: 'Harbor Supply', upDate: '08/14/26', qb: 'Harbor Supply', qbDate: '08/13/26', amt: '$2,450.00', score: 86 },
    { n: '1043', up: 'Willow Creek', upDate: '08/15/26', qb: 'Willow Creek LLC', qbDate: '08/15/26', amt: '$675.25', score: 78 },
  ];
  const tabs = [
    { l: 'All Checks', n: 428, active: true },
    { l: '100% Matches', n: 391 },
    { l: 'Needs Attention', n: 37 },
  ];
  return (
    <div className="text-left">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-glass-hairline">
        <div className="flex items-center gap-3">
          <KyriqIcon size={28} className="rounded-lg" />
          <div>
            <div className="text-[15px] font-bold text-ink-strong">Match &amp; Review</div>
            <div className="text-[11px] text-ink-faint">Sample reconciliation</div>
          </div>
        </div>
        <span className="text-[11px] font-semibold text-success-text bg-success-bg px-2.5 py-1 rounded-full">Every check stays visible</span>
      </div>

      <div className="flex gap-1.5 px-4 sm:px-6 pt-4 overflow-x-auto">
        {tabs.map((t) => (
          <span
            key={t.l}
            className={cn(
              'whitespace-nowrap text-[11px] sm:text-xs font-semibold px-3 py-1.5 rounded-full border',
              t.active ? 'bg-brand text-white border-brand' : 'bg-surface text-ink-soft border-glass-hairline'
            )}
          >
            {t.l} <span className="nums opacity-80">{t.n}</span>
          </span>
        ))}
      </div>

      <div className="px-4 sm:px-6 py-4">
        <div className="hidden sm:grid grid-cols-[1fr_1fr_64px_88px] gap-3 px-3 pb-2 text-eyebrow text-ink-faint">
          <span>Uploaded check</span>
          <span>QuickBooks check</span>
          <span className="text-center">Score</span>
          <span className="text-right">Action</span>
        </div>
        <div className="space-y-1.5">
          {rows.map((r) => {
            const exact = r.score === 100;
            return (
              <div
                key={r.n}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_1fr_64px_88px] items-center gap-3 rounded-input border border-glass-hairline bg-surface px-3 py-2.5 shadow-contact"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-ink-strong truncate">#{r.n} · {r.up}</div>
                  <div className="text-[11px] text-ink-faint nums">{r.upDate} · {r.amt}</div>
                </div>
                <div className="hidden sm:block min-w-0">
                  <div className="text-xs font-semibold text-ink-body truncate">#{r.n} · {r.qb}</div>
                  <div className="text-[11px] text-ink-faint nums">{r.qbDate} · {r.amt}</div>
                </div>
                <span className={cn('hidden sm:block text-center text-xs font-bold nums', exact ? 'text-success-text' : 'text-warning-text')}>
                  {r.score}%
                </span>
                <span
                  className={cn(
                    'justify-self-end text-[11px] font-semibold px-3 py-1 rounded-full',
                    exact ? 'bg-success text-white' : 'bg-brand-wash text-brand-deep'
                  )}
                >
                  {exact ? 'Approve' : 'Review'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-surface-sunken border-t border-glass-hairline">
        <span className="text-xs text-ink-soft">
          <span className="font-bold text-ink-strong nums">391</span> exact matches ready
        </span>
        <span className="text-xs font-semibold bg-brand text-white px-4 py-2 rounded-full shadow-brand-glow">Approve all 100% matches</span>
      </div>
    </div>
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
    <section className="bg-shell-solid py-10 sm:py-12">
      <div className="max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-y-8 px-6 stagger">
        {facts.map((s, i) => (
          <div key={s.label} className={cn('animate-glass-rise text-center px-3', i < 3 && 'lg:border-r lg:border-glass-hairline-dark')}>
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

/**
 * Export formats. A marquee of things the product actually does — the old
 * strip was twelve invented firm names under "Trusted by 500+ accounting
 * firms", which is exactly what item 1 of the client's list removes.
 */
// Brand marks are Simple Icons (CC0), tinted with each company's own colour.
const EXPORT_TARGETS: { name: string; logo?: string }[] = [
  { name: 'QuickBooks Online', logo: '/integrations/quickbooks.svg' },
  { name: 'Xero', logo: '/integrations/xero.svg' },
  { name: 'Sage', logo: '/integrations/sage.svg' },
  { name: 'Zoho Books', logo: '/integrations/zoho.svg' },
  { name: 'Chrome extension', logo: '/integrations/googlechrome.svg' },
  { name: 'CSV' },
  { name: 'IIF' },
  { name: 'QBO' },
];

function ExportMarquee() {
  return (
    <section className="py-10 sm:py-16 border-y hairline bg-surface/40">
      <p className="text-center text-eyebrow text-ink-faint mb-6 sm:mb-8 px-4">Reconcile in QuickBooks, export anywhere</p>
      {/* Magic-UI: marquee keyframe + --duration / --gap. */}
      <Marquee pauseOnHover className="[--duration:35s]" gap="1rem">
        {EXPORT_TARGETS.map(({ name, logo }) => (
          <div key={name} className="flex items-center gap-2 px-4 sm:px-5 py-2 glass-card rounded-pill whitespace-nowrap">
            {logo
              ? <img src={logo} alt="" width={18} height={18} className="h-[18px] w-[18px]" aria-hidden />
              : <FileText size={14} className="text-brand" aria-hidden />}
            <span className="text-xs sm:text-sm font-semibold text-ink-body">{name}</span>
          </div>
        ))}
      </Marquee>
    </section>
  );
}

function SectionHead({ eyebrow, title, blurb, dark }: { eyebrow: string; title: string; blurb?: string; dark?: boolean }) {
  return (
    <div className="text-center mb-12 sm:mb-16">
      <span className={cn('text-eyebrow mb-3 block', dark ? 'text-accentEmerald' : 'text-brand')}>{eyebrow}</span>
      <h2 className={cn('text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-[-0.025em] leading-[1.08] mb-5', dark ? 'text-shell-text' : 'text-ink-strong')}>
        {title}
      </h2>
      {blurb && <p className={cn('text-lg max-w-[520px] mx-auto leading-relaxed', dark ? 'text-shell-muted' : 'text-ink-soft')}>{blurb}</p>}
    </div>
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
    <section id="how" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-[1100px] mx-auto">
        <SectionHead
          eyebrow="One clear workflow"
          title="From your bank statement to a completed QuickBooks reconciliation"
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 relative stagger">
          <div className="hidden lg:block absolute top-[38px] left-[10%] w-[80%] h-px bg-gradient-to-r from-transparent via-brand to-transparent opacity-30" aria-hidden />
          {steps.map((s) => (
            <div key={s.num} className="animate-glass-rise glass-card rounded-card p-6 relative">
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
    <section id="features" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-[1100px] mx-auto">
        <SectionHead
          eyebrow="Built for firms"
          title="Built for bookkeeping and accounting firms"
          blurb="Spend less time checking transactions one by one. Kyriq organizes the full batch by match result, so judgment goes where it is needed."
        />
        <div className="grid sm:grid-cols-2 gap-4 stagger">
          {points.map((f) => (
            <div key={f.title} className="animate-glass-rise glass-card rounded-card p-7 sm:p-8 hover-lift flex gap-5">
              <div className={cn('w-12 h-12 shrink-0 rounded-input flex items-center justify-center text-white', f.tone)}>{f.icon}</div>
              <div>
                <h3 className="text-lg font-bold tracking-display text-ink-strong mb-2">{f.title}</h3>
                <p className="text-sm text-ink-body leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ExtensionSection() {
  return (
    <section id="extension" className="py-16 sm:py-24 px-4 sm:px-6 bg-shell-solid relative overflow-hidden">
      <div className="max-w-[1100px] mx-auto relative">
        <SectionHead
          dark
          eyebrow="Chrome extension"
          title="Works right inside QuickBooks"
          blurb="Approve and clear matched checks without leaving QuickBooks Online. The Kyriq Chrome extension is included with every plan and during the trial."
        />
        <ExtensionSlide />
      </div>
    </section>
  );
}

const VOICE_PROMPTS = [
  'Which checks need attention this week?',
  'Read me check 1042.',
  'Show every payment to Harbor Supply this quarter.',
  'How many exact matches are ready to approve?',
];

/** Kyriq Voice teaser. The working beta lives at /voice for signed-in firms. */
function VoiceSection() {
  return (
    <section id="voice" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-[1100px] mx-auto">
        <div className="relative overflow-hidden rounded-modal bg-shell-solid p-8 sm:p-12 lg:p-14 shadow-glass-modal">
          <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_40%_40%,hsl(var(--brand-light)/0.5),hsl(var(--brand)/0.15)_55%,transparent_72%)] blur-xl" />
          <div className="relative grid lg:grid-cols-[1.1fr_1fr] gap-10 items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-glass-hairline-dark bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-eyebrow text-accentEmerald mb-5">
                <Mic className="w-3.5 h-3.5" aria-hidden /> Kyriq Voice · Coming soon
              </span>
              <h2 className="text-3xl sm:text-4xl md:text-[44px] font-extrabold tracking-[-0.025em] leading-[1.08] text-shell-text mb-5">
                Ask your reconciliation out loud.
              </h2>
              <p className="text-[15px] sm:text-base text-shell-muted leading-relaxed mb-4">
                Talk to Kyriq like a colleague. Ask what needs attention, have a check read back, or pull up every payment
                to a vendor. Kyriq Voice answers from your own firm&apos;s data, remembers your companies and payees, and
                never clears anything without your approval.
              </p>
              <p className="text-[13px] text-shell-muted/80 mb-8">Starting with checks. Full-books reconciliation is next.</p>
              <a
                href="mailto:support@kyriq.com?subject=Kyriq%20Voice%20waitlist"
                className={cn(buttonVariants({ variant: 'primary', size: 'lg' }))}
              >
                Join the waitlist <ArrowRight size={16} aria-hidden />
              </a>
            </div>

            <div className="rounded-card border border-glass-hairline-dark bg-white/[0.04] p-5 sm:p-6">
              {/* Waveform. CSS pulse with staggered delays; stops under reduced motion via globals.css. */}
              <div className="flex items-end justify-center gap-1 h-16 mb-6" aria-hidden>
                {[28, 44, 60, 36, 52, 64, 40, 56, 30, 48, 62, 34, 50, 26].map((h, i) => (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-gradient-to-t from-brand to-accentEmerald animate-pulse"
                    style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }}
                  />
                ))}
              </div>
              <ul className="space-y-2">
                {VOICE_PROMPTS.map((p) => (
                  <li key={p} className="flex items-center gap-3 rounded-input bg-white/[0.06] px-4 py-3 text-[13px] text-shell-text">
                    <Mic className="w-3.5 h-3.5 shrink-0 text-accentEmerald" aria-hidden />
                    &ldquo;{p}&rdquo;
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExtensionSlide() {
  const qboRows = [
    { am: '$2,450.00', name: 'Acme Supply Co.', date: 'Mar 12', badge: 'high', score: '98' },
    { am: '$870.50', name: 'Metro Office Solutions', date: 'Mar 13', badge: 'high', score: '94' },
    { am: '$3,100.00', name: 'Riverside Contractors', date: 'Mar 14', badge: 'med', score: '72' },
    { am: '$215.00', name: 'Office Depot', date: 'Mar 15', badge: '', score: '' },
    { am: '$560.25', name: 'City Utilities LLC', date: 'Mar 16', badge: 'high', score: '97' },
  ];
  const extCards = [
    { am: '$2,450.00', py: 'Acme Supply Co. · Check #1042', sc: '98', warn: false },
    { am: '$870.50', py: 'Metro Office Solutions · Check #1043', sc: '94', warn: false },
    { am: '$3,100.00', py: 'Riverside Contractors · Check #1044', sc: '72', warn: true },
  ];

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
      <div className="bg-surface rounded-card overflow-hidden shadow-glass-modal">
        <div className="bg-success-dark px-4 py-2.5 flex items-center gap-2">
          <span className="text-[13px] font-bold text-white tracking-display">QuickBooks</span>
          <span className="text-[10px] text-white/60 ml-auto">Acme Corp</span>
        </div>
        <div className="px-3 py-2.5 bg-surface-sunken border-b border-glass-hairline text-[11px] font-semibold text-ink-body">
          Banking · For Review (24)
        </div>
        <div className="p-3 space-y-1">
          {qboRows.map((r) => (
            <div
              key={r.am}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-input text-xs border',
                r.badge === 'high' ? 'bg-success-bg border-success-border' : r.badge === 'med' ? 'bg-warning-bg border-warning-border' : 'border-transparent'
              )}
            >
              <span className="font-bold text-ink-strong min-w-[72px] nums">{r.am}</span>
              <span className="flex-1 text-ink-body">{r.name}</span>
              <span className="text-[11px] text-ink-faint">{r.date}</span>
              {r.badge && (
                <span className={cn('text-[9px] font-bold px-2 py-0.5 rounded-full text-white', r.badge === 'high' ? 'bg-success' : 'bg-warning')}>
                  kyriq {r.score}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-shell-solid rounded-card overflow-hidden shadow-glass-modal border border-glass-hairline-dark">
        <div className="bg-gradient-to-r from-brand to-brand-dark px-4 py-3 flex items-center gap-2">
          <KyriqLogo height={22} variant="white" />
          <span className="ml-auto bg-success text-white text-[10px] font-bold px-2 py-0.5 rounded-full">4 pending</span>
        </div>
        <div className="p-2 space-y-1.5">
          {extCards.map((c) => (
            <div key={c.am} className={cn('rounded-input p-3 border bg-white/[0.06]', c.warn ? 'border-warning/30' : 'border-glass-hairline-dark')}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-extrabold text-shell-text tracking-wordmark nums">{c.am}</span>
                <span className={cn('text-[10px] font-bold nums', c.warn ? 'text-warning' : 'text-accentEmerald')}>{c.sc}</span>
              </div>
              <div className="text-[11px] text-shell-muted mb-2">{c.py}</div>
              <div className="flex gap-1.5">
                <span className="text-[10px] font-semibold bg-success text-white px-2.5 py-1 rounded-full">Approve</span>
                <span className="text-[10px] font-semibold bg-white/[0.08] text-shell-muted px-2.5 py-1 rounded-full">Flag</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   Pricing. Every number below is from CHECKLIST 12 / section 7 and must not
   drift — scripts/check-landing.ts asserts each one.
   ========================================================================= */

type Plan = {
  tier: string;
  name: string;
  monthly: number;
  annual: number;
  allowance: number;
  overage: string;
  popular?: boolean;
  extra?: string;
};

const PLANS: Plan[] = [
  { tier: 'essential', name: 'Starter', monthly: 249, annual: 2739, allowance: 1200, overage: '0.20' },
  { tier: 'professional', name: 'Professional', monthly: 649, annual: 7139, allowance: 4500, overage: '0.20', popular: true, extra: 'Priority support' },
  { tier: 'scale', name: 'Firm', monthly: 1299, annual: 14289, allowance: 10000, overage: '0.20', extra: 'Onboarding assistance' },
];

/** True of every plan, so it is stated once and rendered on all three. */
const INCLUDED_IN_EVERY_PLAN = [
  'Unlimited companies',
  'Unlimited users',
  'Kyriq Chrome extension included',
  'All core features',
];

function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-[1100px] mx-auto">
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

        <div className="grid md:grid-cols-3 gap-5 stagger items-stretch">
          {PLANS.map((p) => (
            <div
              key={p.tier}
              className={cn(
                'animate-glass-rise relative rounded-card p-8 h-full flex flex-col',
                p.popular ? 'bg-shell-solid text-shell-text shadow-brand-glow' : 'glass-card'
              )}
            >
              {p.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-brand to-brand-dark text-white text-[10px] font-bold uppercase tracking-eyebrow px-4 py-1 rounded-full whitespace-nowrap">
                  Most Popular
                </span>
              )}

              <div className={cn('text-eyebrow mb-2', p.popular ? 'text-accentEmerald' : 'text-brand')}>{p.name}</div>

              <div className={cn('text-[44px] font-extrabold tracking-[-0.025em] leading-none mb-1 nums', p.popular ? 'text-shell-text' : 'text-ink-strong')}>
                <sup className="text-xl font-bold align-super">$</sup>
                {annual ? p.annual.toLocaleString('en-US') : p.monthly}
              </div>
              <div className={cn('text-[13px] mb-2', p.popular ? 'text-shell-muted' : 'text-ink-faint')}>
                {annual ? 'per year — one month free' : 'per month'}
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

              <Link href={CTA_HREF} className={cn(buttonVariants({ variant: p.popular ? 'primary' : 'secondary', size: 'md', block: true }))}>
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

/* =========================================================================
   FAQ. The 15 pairs are verbatim from the client's approved redesign site
   (kyriq-website-redesign, Sep 2026). This is customer-facing copy about
   billing and data handling: change it only with the client's sign-off.
   ========================================================================= */
const FAQS: { q: string; a: string }[] = [
  {
    q: 'What does Kyriq do?',
    a: 'Upload the bank statement you already download and Kyriq extracts the checks from it. Kyriq then reads each check, compares every processed check with the corresponding QuickBooks Online transaction, and lets your team approve 100% matches together, review lower-confidence results individually, identify duplicates and discrepancies, and clear approved matches in the QBO reconciliation.',
  },
  {
    q: 'Do I need another program to extract checks from my bank statement?',
    a: 'No. Upload your downloaded bank statement directly to Kyriq and Kyriq extracts the checks for you. This removes the separate extraction and re-upload steps. You may also upload individual check images when needed.',
  },
  {
    q: 'Does Kyriq display every processed check?',
    a: 'Yes. Every processed check remains visible. Use the 100% Matches view for exact matches, Needs Attention for results requiring a decision, and All Checks for the complete batch.',
  },
  {
    q: 'How does bulk approval work?',
    a: 'Kyriq groups checks that match their QuickBooks transactions with 100% confidence. An authorized user can review those checks individually or approve the entire 100% match group at once. Lower-confidence matches and discrepancies remain available for individual review.',
  },
  {
    q: 'Does Kyriq automatically clear checks in QuickBooks?',
    a: 'Nothing is cleared without user approval. After an authorized user approves a match, Kyriq clears the corresponding transaction in the QuickBooks reconciliation.',
  },
  {
    q: 'Can Kyriq process multiple checks on one page?',
    a: 'Yes. Kyriq supports PDF, JPG, and PNG files and can identify and process multiple checks appearing on the same uploaded page.',
  },
  {
    q: 'Can Kyriq read handwritten checks?',
    a: 'Yes. Kyriq can extract information from both typed and handwritten checks. Each result includes a confidence score, and lower-confidence information remains available for your team to review and approve before anything is cleared in QuickBooks.',
  },
  {
    q: 'Is the Kyriq Chrome extension included?',
    a: 'Yes. The Kyriq Chrome extension and web app are included with every paid plan and during the free trial. No separate extension purchase is required.',
  },
  {
    q: 'What counts toward my monthly check allowance?',
    a: 'A check counts when it is successfully processed from an upload. If the same check is uploaded and processed again, it counts again. System retries should not create duplicate usage.',
  },
  {
    q: 'What is included in the free trial?',
    a: 'The trial lasts 14 days or until 250 checks have been processed, whichever comes first. No credit card is required, and you can use the complete reconciliation workflow during the trial.',
  },
  {
    q: 'Are companies and team members limited?',
    a: 'No. Kyriq plans include unlimited QuickBooks companies and unlimited users. Pricing is based on the number of checks processed.',
  },
  {
    q: 'What happens when I exceed my plan allowance?',
    a: 'You can continue processing checks. Additional checks are billed automatically at your plan’s stated overage rate, and the included allowance resets at the beginning of each monthly usage cycle.',
  },
  {
    q: 'How do annual plans and cancellations work?',
    a: 'Annual plans are prepaid 12-month commitments and include the equivalent of one month free. You may cancel automatic renewal at any time, and service continues through the paid-through date. Monthly plans may be canceled at any time.',
  },
  {
    q: 'Which accounting platform does Kyriq support?',
    a: 'Kyriq currently connects with QuickBooks Online for transaction comparison and reconciliation clearing.',
  },
  {
    q: 'Where can I get help?',
    a: 'Email Kyriq Support at support@kyriq.com for help with your account, QuickBooks connection, uploads, reconciliation, or billing.',
  },
];

function Faq() {
  return (
    <section id="faq" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-[1100px] mx-auto">
        <SectionHead
          eyebrow="Frequently asked questions"
          title="Everything you need to know before your first reconciliation"
          blurb="How Kyriq extracts checks from your bank statement, compares them with QuickBooks, manages approvals, and calculates plan usage."
        />
        <div className="grid md:grid-cols-2 gap-3 items-start">
          {FAQS.map((item, i) => (
            // <details> rather than a JS accordion: keyboard and screen-reader
            // correct for free, and it works before hydration.
            <details key={item.q} open={i === 0} className="glass-card rounded-card px-6 py-5 group">
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
    <section className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto relative rounded-modal overflow-hidden animate-glass-rise">
        <div className="relative bg-shell-solid p-8 sm:p-12 md:p-16 text-center">
          <div aria-hidden className="pointer-events-none absolute -left-20 -bottom-24 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle_at_50%_50%,hsl(var(--brand)/0.45),transparent_70%)] blur-xl" />
          <h2 className="relative text-2xl sm:text-3xl md:text-4xl font-extrabold text-shell-text tracking-[-0.025em] mb-4">
            Ready to reconcile checks in a fraction of the time?
          </h2>
          <p className="relative text-sm sm:text-lg text-shell-muted mb-8 max-w-2xl mx-auto">
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

function Footer() {
  const footerCols: Record<string, { label: string; href: string }[]> = {
    Product: [
      { label: 'How it works', href: '#how' },
      { label: 'Chrome extension', href: '#extension' },
      { label: 'Kyriq Voice', href: '#voice' },
      { label: 'Pricing', href: '#pricing' },
      { label: 'FAQs', href: '#faq' },
    ],
    Account: [
      { label: CTA_LABEL, href: CTA_HREF },
      { label: 'Sign in', href: '/login' },
      { label: 'support@kyriq.com', href: 'mailto:support@kyriq.com' },
    ],
    Legal: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
    ],
  };
  return (
    <footer className="bg-shell-solid px-6 sm:px-12">
      <div className="max-w-7xl mx-auto pt-16 pb-10">
        <div className="grid grid-cols-2 md:grid-cols-[260px_1fr_1fr_1fr] gap-8 sm:gap-12 pb-12 border-b border-glass-hairline-dark">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <KyriqLogo height={36} variant="white" />
            </div>
            <p className="text-[13px] text-shell-muted leading-relaxed">
              Check reconciliation for QuickBooks Online, built for bookkeeping and accounting firms.
            </p>
          </div>
          {Object.entries(footerCols).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-eyebrow text-shell-muted mb-4">{title}</h4>
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
  // No `bg-*` on the root: the ambient mesh is mounted in the root layout and
  // sits at z-index -1, so an opaque page background would hide the thing the
  // glass is supposed to refract. One scrollbar — nothing here scrolls inside.
  return (
    <div className="min-h-screen text-ink-strong overflow-x-hidden">
      <Nav />
      <Hero />
      <FactsBar />
      <ExportMarquee />
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
