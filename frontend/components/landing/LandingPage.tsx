'use client';

/**
 * Kyriq landing page — parcel I.
 *
 * Two things govern this file:
 *
 * 1. CHECKLIST 12. The fabricated social proof is gone (watch-demo button,
 *    "trusted by 500+ accounting firms", every testimonial), every CTA reads
 *    "Start Free Trial" and routes to /signup, the hero leads with the bank
 *    statement, and pricing is the Essential / Professional / Scale table
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
  Zap, Users, ArrowRight, Upload, Search,
  X, Menu, Check, ScanLine, GitCompare, ClipboardCheck, Flag, FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui';
import { KyriqIcon, KyriqIconWhite } from './KyriqMark';
import { Marquee } from '@/components/ui/marquee';
import { NumberTicker } from '@/components/ui/number-ticker';
import { BorderBeam } from '@/components/ui/border-beam';
import { ShimmerButton } from '@/components/ui/shimmer-button';

/* =========================================================================
   TODO(copy) — the approved wording for this page lives in
   `Kyriq-Developer-Handoff-v17.zip` and on the client's redesign site, and
   NEITHER is in this repo (only the v12 handoff is extracted, at
   kyriq-developer-handoff-v12-final/, and its website.html has no FAQ).
   The two hero sentences below are quoted from CHECKLIST 12 and are exact.
   Everything else that is customer-facing claim or billing wording is either
   restated from the CHECKLIST pricing table or left as a TODO — see FAQS and
   the per-tier feature note in Pricing. Do not invent replacements: this is
   copy about billing and data handling.
   ========================================================================= */

/** The single CTA label and destination. Both are asserted by the check. */
const CTA_LABEL = 'Start Free Trial';
const CTA_HREF = '/signup';

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
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how' },
  { label: 'Extension', href: '#extension' },
  { label: 'Pricing', href: '#pricing' },
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
          <KyriqIcon size={30} className="rounded-lg" />
          <span className="text-xl font-extrabold tracking-wordmark text-ink-strong">kyriq</span>
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

/* ── Hero. Leads with the bank statement (CHECKLIST 12, Michael: "a BIG deal"). ── */
function Hero() {
  return (
    <section className="relative pt-28 sm:pt-36 lg:pt-44 pb-16 sm:pb-24 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto text-center">
        <Rise>
          <span className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 sm:mb-8 rounded-full bg-brand-wash border border-brand-tint text-xs font-semibold text-brand-deep tracking-wide">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accentEmerald opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-accentEmerald" />
            </span>
            Now with Chrome extension for QuickBooks
          </span>
        </Rise>

        {/* Both sentences are quoted verbatim from CHECKLIST 12. */}
        <Rise>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-[80px] font-extrabold tracking-[-0.03em] leading-[1.02] text-ink-strong mb-6">
            Start with the bank statement{' '}
            <span className="bg-gradient-to-r from-brand via-brand-light to-accentEmerald bg-clip-text text-transparent">
              you already download.
            </span>
          </h1>
        </Rise>
        <Rise>
          <p className="text-base sm:text-lg md:text-xl text-ink-soft max-w-[560px] mx-auto mb-10 sm:mb-12 leading-relaxed px-4">
            Typed or handwritten — Kyriq can read both.
          </p>
        </Rise>

        <Rise>
          <div className="flex justify-center mb-16 sm:mb-20 px-4">
            <CtaLink />
          </div>
        </Rise>

        <Rise>
          <div className="max-w-[960px] mx-auto relative rounded-card">
            {/* Magic-UI: border-beam keyframe + --duration. */}
            <BorderBeam size={300} duration={12} />
            <div className="rounded-card overflow-hidden shadow-glass-modal border border-glass-hairline">
              <AppMock />
            </div>
          </div>
        </Rise>
      </div>
    </section>
  );
}

/** A still of the product. Deliberately flat: glass over glass goes muddy. */
function AppMock() {
  const rows = [
    { am: '$2,450.00', py: 'Acme Supply Co.', dt: 'Check #1042 · Mar 12', st: 'approved', sc: 98 },
    { am: '$870.50', py: 'Metro Office Solutions', dt: 'Check #1043 · Mar 13', st: 'matched', sc: 94 },
    { am: '$3,100.00', py: 'Riverside Contractors', dt: 'Check #1044 · Mar 14', st: 'pending', sc: 72 },
    { am: '$560.25', py: 'City Utilities LLC', dt: 'Check #1045 · Mar 15', st: 'matched', sc: 97 },
  ];
  return (
    <>
      <div className="bg-surface-sunken px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 border-b border-glass-hairline">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-error" />
          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-warning" />
          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-success" />
        </div>
        <div className="ml-2 flex-1 bg-surface rounded-md px-3 py-1 text-[10px] sm:text-xs text-ink-faint font-mono truncate flex items-center gap-1.5 border border-glass-hairline">
          <KyriqIcon size={10} /><span>app.kyriq.com/matches</span>
        </div>
      </div>
      <div className="flex min-h-[320px] sm:min-h-[380px]">
        <div className="hidden sm:flex flex-col w-[180px] md:w-[200px] bg-shell-solid p-3 gap-1">
          <div className="flex items-center gap-2 px-3 py-2 mb-3">
            <KyriqIconWhite size={22} />
            <span className="text-sm font-extrabold text-shell-text tracking-wordmark">kyriq</span>
          </div>
          {['Dashboard', 'Upload', 'QB Match', 'Analytics', 'Settings'].map((item, i) => (
            <div key={item} className={cn('px-3 py-2 rounded-input text-xs font-medium', i === 2 ? 'bg-brand/25 text-shell-text' : 'text-shell-muted')}>
              {item}
            </div>
          ))}
        </div>
        <div className="flex-1 bg-surface-tint p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[13px] font-bold text-ink-strong">QB Match</span>
            <div className="flex gap-1.5">
              <span className="bg-success text-white text-[9px] font-bold px-2 py-0.5 rounded-full">Sync QB</span>
              <span className="bg-brand text-white text-[9px] font-bold px-2 py-0.5 rounded-full">Approve All</span>
            </div>
          </div>
          <div className="flex gap-1.5 mb-3">
            {[{ l: 'All 24', a: true }, { l: 'Matched 18', a: false }, { l: 'Pending 4', a: false }, { l: 'Discrepancy 2', a: false }].map((p) => (
              <span key={p.l} className={cn('text-[10px] font-semibold px-2.5 py-1 rounded-full border', p.a ? 'bg-brand text-white border-brand' : 'bg-surface text-ink-faint border-glass-hairline')}>
                {p.l}
              </span>
            ))}
          </div>
          <div className="space-y-1.5">
            {rows.map((r) => (
              <div key={r.am} className="flex items-center gap-2.5 bg-surface rounded-input px-3 py-2.5 border border-glass-hairline shadow-contact">
                <span className="text-xs font-bold text-ink-strong min-w-[72px] nums">{r.am}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-semibold text-ink-body truncate">{r.py}</div>
                  <div className="text-[10px] text-ink-faint">{r.dt}</div>
                </div>
                <span
                  className={cn(
                    'text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide',
                    r.st === 'approved' ? 'bg-info-bg text-info-text' : r.st === 'matched' ? 'bg-success-bg text-success-text' : 'bg-warning-bg text-warning-text'
                  )}
                >
                  {r.st}
                </span>
                <span className={cn('text-[10px] font-bold min-w-[24px] text-right nums', r.sc >= 90 ? 'text-success-text' : 'text-warning-text')}>{r.sc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * The facts bar. Every number here is specified — the 14-day / 250-check
 * trial comes from the client's list, the four steps from CHECKLIST 12 — so
 * nothing on it is a performance claim nobody can stand behind. That is also
 * why the old "98% accuracy / 0 missed checks" bar is gone.
 */
function FactsBar() {
  const facts = [
    { value: 14, suffix: '-day', label: 'Free trial, no card required' },
    { value: 250, suffix: '', label: 'Checks included in the trial' },
    { value: 4, suffix: ' steps', label: 'Upload, match, approve, cleared' },
  ];
  return (
    <section className="bg-shell-solid py-10 sm:py-12">
      <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-0 px-6 stagger">
        {facts.map((s, i) => (
          <div key={s.label} className={cn('animate-glass-rise text-center', i < 2 && 'sm:border-r sm:border-glass-hairline-dark')}>
            <div className="text-3xl sm:text-4xl font-extrabold text-shell-text tracking-[-0.025em] mb-1 nums">
              <span className="text-accentEmerald"><NumberTicker value={s.value} /></span>
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
const EXPORT_TARGETS = ['QuickBooks Online', 'Xero', 'Sage', 'Zoho Books', 'CSV', 'IIF', 'QBO', 'Chrome extension'];

function ExportMarquee() {
  return (
    <section className="py-10 sm:py-16 border-y hairline bg-surface/40">
      <p className="text-center text-eyebrow text-ink-faint mb-6 sm:mb-8 px-4">Reconcile in QuickBooks, export anywhere</p>
      {/* Magic-UI: marquee keyframe + --duration / --gap. */}
      <Marquee pauseOnHover className="[--duration:35s]" gap="1rem">
        {EXPORT_TARGETS.map((name) => (
          <div key={name} className="flex items-center gap-2 px-4 sm:px-5 py-2 glass-card rounded-pill whitespace-nowrap">
            <FileText size={14} className="text-brand" aria-hidden />
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

function Features() {
  const features = [
    {
      icon: <ScanLine className="w-5 h-5" />,
      title: 'Bank statements, typed or handwritten',
      desc: 'Start with the statement you already download. Kyriq reads both typed and handwritten entries, so nothing has to be keyed in twice.',
      tone: 'bg-gradient-to-br from-accentEmerald to-accentEmerald-dark',
    },
    {
      icon: <Search className="w-5 h-5" />,
      title: 'AI confidence scoring',
      desc: 'Every match is scored by amount, check number, date, and payee — so you know exactly how confident the system is before you approve.',
      tone: 'bg-gradient-to-br from-brand to-brand-dark',
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: 'One-click approval',
      desc: 'Approve a single check or bulk-approve an entire batch. Kyriq sets the clearing status in QuickBooks for you.',
      tone: 'bg-gradient-to-br from-brand-light to-brand',
    },
    {
      icon: <Users className="w-5 h-5" />,
      title: 'Multi-company support',
      desc: 'Switch between all your QuickBooks companies from one dashboard. Each company keeps its own connection and reconciliation history.',
      tone: 'bg-gradient-to-br from-brand-dark to-brand-deep',
    },
    {
      icon: <Flag className="w-5 h-5" />,
      title: 'Flag and resolve discrepancies',
      desc: 'Flag anything that looks off with a preset or custom reason, then resolve with a write-off, split, or remap.',
      tone: 'bg-gradient-to-br from-warning to-warning-dark',
    },
    {
      icon: <ClipboardCheck className="w-5 h-5" />,
      title: 'Full audit trail',
      desc: 'Every approval, flag, note and remap is logged with a timestamp and a user, so a review can always be reconstructed.',
      tone: 'bg-gradient-to-br from-accentEmerald-dark to-brand-deep',
    },
  ];
  return (
    <section id="features" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-[1100px] mx-auto">
        <SectionHead
          eyebrow="Features"
          title="Everything your team needs to reconcile faster"
          blurb="Built for accounting firms handling multiple QuickBooks companies at once."
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
          {features.map((f) => (
            <div key={f.title} className="animate-glass-rise glass-card rounded-card p-8 hover-lift">
              <div className={cn('w-12 h-12 rounded-input flex items-center justify-center text-white mb-5', f.tone)}>{f.icon}</div>
              <h3 className="text-lg font-bold tracking-display text-ink-strong mb-2.5">{f.title}</h3>
              <p className="text-sm text-ink-body leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { num: 1, icon: <Upload className="w-6 h-6" />, title: 'Upload', desc: 'Drop in the bank statement or the check images. Kyriq extracts every field.' },
    { num: 2, icon: <ScanLine className="w-6 h-6" />, title: 'Kyriq matches', desc: 'Each entry is compared against live QuickBooks data with a confidence score.' },
    { num: 3, icon: <Check className="w-6 h-6" />, title: 'Review and approve', desc: 'Approve one at a time or in bulk. Flag anything that needs a second look.' },
    { num: 4, icon: <GitCompare className="w-6 h-6" />, title: 'Cleared in QuickBooks', desc: 'Approved checks are marked cleared, ready for the monthly reconciliation.' },
  ];
  return (
    <section id="how" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-[1000px] mx-auto">
        <SectionHead
          eyebrow="How it works"
          title="From statement to cleared in four steps"
          blurb="No manual cross-referencing. Kyriq does the matching — you review and approve."
        />
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 relative stagger">
          <div className="hidden md:block absolute top-7 left-[12%] w-[76%] h-px bg-gradient-to-r from-transparent via-brand to-transparent opacity-30" aria-hidden />
          {steps.map((s) => (
            <div key={s.num} className="animate-glass-rise text-center relative">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-brand to-brand-dark flex items-center justify-center text-white mx-auto mb-5 shadow-brand-glow relative z-10">
                <span className="text-lg font-extrabold">{s.num}</span>
              </div>
              <h3 className="text-[15px] font-bold tracking-display text-ink-strong mb-2">{s.title}</h3>
              <p className="text-[13px] text-ink-body leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CarouselSection() {
  const [activeSlide, setActiveSlide] = useState(0);
  const reduced = useReducedMotion();

  const slides = [
    {
      id: 'extension',
      badge: 'Chrome Extension',
      title: 'Works right inside QuickBooks',
      desc: 'The Kyriq extension lives inside your QB tab — no switching apps, no copy-paste.',
      content: <ExtensionSlide />,
    },
    {
      id: 'comparison',
      badge: 'Time saving',
      title: 'Manual vs. Kyriq',
      desc: 'Where the hours actually go in a manual reconciliation.',
      content: <ComparisonSlide />,
    },
  ];

  // Auto-rotation is motion the reader did not ask for, so it stops entirely
  // under prefers-reduced-motion rather than just going faster.
  useEffect(() => {
    if (reduced) return;
    const interval = setInterval(() => setActiveSlide((prev) => (prev + 1) % slides.length), 6000);
    return () => clearInterval(interval);
  }, [slides.length, reduced]);

  return (
    <section id="extension" className="py-16 sm:py-24 px-4 sm:px-6 bg-shell-solid relative overflow-hidden">
      <div className="max-w-[1000px] mx-auto relative">
        <SectionHead dark eyebrow={slides[activeSlide].badge} title={slides[activeSlide].title} blurb={slides[activeSlide].desc} />

        <div className="relative">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeSlide}
              initial={reduced ? { opacity: 0 } : { opacity: 0, x: 60 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, x: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: -60 }}
              transition={{ duration: reduced ? 0.16 : 0.4, ease: [0.23, 1, 0.32, 1] }}
            >
              {slides[activeSlide].content}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center justify-center gap-2 mt-10">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setActiveSlide(i)}
              className={cn('press h-1.5 rounded-full transition-[width,background-color] duration-settle ease-settle', i === activeSlide ? 'w-8 bg-shell-text' : 'w-1.5 bg-shell-muted/40')}
              aria-label={`Show ${s.badge}`}
              aria-current={i === activeSlide}
            />
          ))}
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
          <KyriqIconWhite size={22} />
          <span className="text-sm font-extrabold text-white tracking-wordmark">kyriq</span>
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

function ComparisonSlide() {
  const rows = [
    { task: 'Extract data from 100 checks', manual: '3-4 hours', cs: '45 seconds' },
    { task: 'Match checks to QuickBooks', manual: '2-3 hours', cs: 'Instant' },
    { task: 'Identify mismatches', manual: '1-2 hours', cs: 'Instant' },
    { task: 'Switch between companies', manual: 'Log out, log in', cs: 'One click' },
    { task: 'Generate reconciliation report', manual: '30-60 min', cs: 'One click' },
    { task: 'Detect duplicate entries', manual: 'Often missed', cs: 'Automatic' },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="rounded-card border border-glass-hairline-dark bg-white/[0.02] overflow-hidden">
        <div className="hidden sm:flex items-center py-4 px-4 sm:px-6 border-b border-glass-hairline-dark">
          <div className="flex-1 text-eyebrow text-shell-muted">Task</div>
          <div className="w-28 sm:w-36 text-center text-eyebrow text-shell-muted">Manual</div>
          <div className="w-28 sm:w-36 text-center text-eyebrow text-accentEmerald">Kyriq</div>
        </div>
        {rows.map((r) => (
          <div key={r.task} className="border-b border-glass-hairline-dark last:border-0">
            <div className="hidden sm:flex items-center py-4 px-4 sm:px-6">
              <div className="flex-1 text-sm text-shell-text font-medium">{r.task}</div>
              <div className="w-28 sm:w-36 text-center text-sm text-shell-muted line-through">{r.manual}</div>
              <div className="w-28 sm:w-36 text-center text-sm text-accentEmerald font-semibold">{r.cs}</div>
            </div>
            <div className="sm:hidden px-4 py-3 space-y-1.5">
              <div className="text-sm text-shell-text font-medium">{r.task}</div>
              <div className="flex justify-between text-xs">
                <span className="text-shell-muted line-through">Manual: {r.manual}</span>
                <span className="text-accentEmerald font-semibold">{r.cs}</span>
              </div>
            </div>
          </div>
        ))}
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
};

const PLANS: Plan[] = [
  { tier: 'essential', name: 'Essential', monthly: 147, annual: 1617, allowance: 1200, overage: '0.15' },
  { tier: 'professional', name: 'Professional', monthly: 497, annual: 5467, allowance: 4500, overage: '0.12', popular: true },
  { tier: 'scale', name: 'Scale', monthly: 997, annual: 10967, allowance: 10000, overage: '0.10' },
];

/** True of every plan, so it is stated once and rendered on all three. */
const INCLUDED_IN_EVERY_PLAN = [
  'Kyriq Chrome extension included',
  'Unlimited QuickBooks companies',
  'Bank statement and check extraction',
  'AI confidence matching and audit trail',
];

function Pricing() {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-[1100px] mx-auto">
        <SectionHead
          eyebrow="Pricing"
          title="Pay for the volume you process"
          blurb="Every plan includes the Kyriq Chrome extension. Start with a 14-day free trial covering up to 250 checks."
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
                {INCLUDED_IN_EVERY_PLAN.map((f) => (
                  <li key={f} className={cn('flex items-start gap-2.5 text-[13px]', p.popular ? 'text-shell-text' : 'text-ink-body')}>
                    <span className={cn('mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0', p.popular ? 'bg-white/10' : 'bg-brand-wash')}>
                      <Check size={10} className={p.popular ? 'text-accentEmerald' : 'text-brand'} aria-hidden />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* TODO(copy): the per-tier feature differences (support level,
                  onboarding, seat limits) are in the v17 handoff, which is not
                  in this repo. Until it is, every plan shows only what is
                  specified in CHECKLIST 12 plus what is true of all of them. */}

              <Link href={CTA_HREF} className={cn(buttonVariants({ variant: p.popular ? 'primary' : 'secondary', size: 'md', block: true }))}>
                {CTA_LABEL}
              </Link>
            </div>
          ))}
        </div>

        {/* Usage, overage and the annual terms — CHECKLIST 12. */}
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="glass-card rounded-card p-6">
            <h3 className="text-[15px] font-bold text-ink-strong mb-2">How usage is counted</h3>
            <p className="text-[13px] text-ink-body leading-relaxed">
              A check counts once, when it is extracted. Your monthly allowance is {PLANS.map((p) => p.allowance.toLocaleString('en-US')).join(' / ')} checks on
              Essential / Professional / Scale. Past the allowance you are billed
              ${PLANS.map((p) => p.overage).join(' / ')} per additional check, on the same three plans.
            </p>
          </div>
          <div className="glass-card rounded-card p-6">
            <h3 className="text-[15px] font-bold text-ink-strong mb-2">Annual terms</h3>
            <p className="text-[13px] text-ink-body leading-relaxed">
              An annual plan is a 12-month commitment. The check allowance still resets monthly and does not roll over.
              Overage is billed monthly as it is used. Annual plans are not prorated or refunded if you cancel mid-term.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* =========================================================================
   FAQ.

   TODO(copy): the approved 15-question FAQ lives in
   `Kyriq-Developer-Handoff-v17.zip` and on the client's redesign site. NEITHER
   is in this repo — the only extracted handoff is
   kyriq-developer-handoff-v12-final/, whose website.html has no FAQ at all.
   This is customer-facing copy about billing, data handling and retention, so
   it is deliberately NOT written here: paste the 15 approved pairs into FAQS
   below and the section renders itself, including the #faq nav link.

   Fifteen is the expected count; check-landing.ts warns if a different number
   of pairs lands, so a partial paste does not ship silently.
   ========================================================================= */
const FAQS: { q: string; a: string }[] = [];

function Faq() {
  if (FAQS.length === 0) return null;
  return (
    <section id="faq" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-[820px] mx-auto">
        <SectionHead eyebrow="FAQ" title="Questions firms ask before they start" />
        <div className="grid gap-3 stagger">
          {FAQS.map((item) => (
            // <details> rather than a JS accordion: it is keyboard and
            // screen-reader correct for free, and works before hydration.
            <details key={item.q} className="animate-glass-rise glass-card rounded-card px-6 py-5 group">
              <summary className="cursor-pointer list-none flex items-start justify-between gap-4 text-[15px] font-semibold text-ink-strong">
                {item.q}
                <span className="shrink-0 text-brand transition-transform duration-quick ease-settle group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-sm text-ink-body leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  const router = useRouter();
  return (
    <section className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto relative rounded-modal overflow-hidden animate-glass-rise">
        <div className="bg-shell-solid p-8 sm:p-12 md:p-16 text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-shell-text tracking-[-0.025em] mb-4">
            Ready to automate your reconciliation?
          </h2>
          <p className="text-sm sm:text-lg text-shell-muted mb-8 max-w-xl mx-auto">
            Fourteen days free, up to 250 checks, and the Chrome extension included from the first day.
          </p>
          <div className="flex justify-center">
            {/* Magic-UI: shimmer-slide keyframe + --speed. A <button> that
                routes, not an anchor, because an <a> may not contain
                interactive content and ShimmerButton renders a <button>.
                The crawlable /signup anchors are the hero, nav and pricing. */}
            <ShimmerButton
              onClick={() => router.push(CTA_HREF)}
              className="min-h-btn px-8 text-[15px] font-semibold text-white shadow-brand-glow"
              background="linear-gradient(90deg, hsl(var(--brand)), hsl(var(--brand-dark)))"
            >
              {CTA_LABEL}
              <ArrowRight size={16} className="ml-2" aria-hidden />
            </ShimmerButton>
          </div>
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
      { label: 'Features', href: '#features' },
      { label: 'How it works', href: '#how' },
      { label: 'Chrome extension', href: '#extension' },
      { label: 'Pricing', href: '#pricing' },
    ],
    Account: [
      { label: CTA_LABEL, href: CTA_HREF },
      { label: 'Sign in', href: '/login' },
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
            <div className="flex items-center gap-2.5 mb-3">
              <KyriqIconWhite size={32} />
              <span className="text-lg font-extrabold text-shell-text tracking-wordmark">kyriq</span>
            </div>
            <p className="text-[13px] text-shell-muted leading-relaxed">
              QuickBooks check reconciliation, automated for modern accounting firms.
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
          <span>&copy; 2026 Kyriq. All rights reserved.</span>
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
      <Features />
      <HowItWorks />
      <CarouselSection />
      <Pricing />
      <Faq />
      <CTASection />
      <Footer />
    </div>
  );
}
