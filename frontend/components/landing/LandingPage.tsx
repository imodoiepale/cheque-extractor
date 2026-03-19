'use client';

import { useState, useEffect, useRef, ReactNode } from 'react';
import Link from 'next/link';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, Zap, Shield, Users, BarChart3,
  ArrowRight, Star, Upload, Search,
  Sparkles, RefreshCw, X, Menu, Check, ArrowDown,
  ScanLine, GitCompare, ClipboardCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Marquee } from '@/components/ui/marquee';
import { NumberTicker } from '@/components/ui/number-ticker';
import { BorderBeam } from '@/components/ui/border-beam';
import { ShimmerButton } from '@/components/ui/shimmer-button';

function FadeIn({ children, className, delay = 0, direction = 'up' }: {
  children: ReactNode; className?: string; delay?: number; direction?: 'up' | 'down' | 'left' | 'right';
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
  const offset = direction === 'down' || direction === 'right' ? -40 : 40;
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, [axis]: offset }}
      animate={isInView ? { opacity: 1, [axis]: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.21, 0.47, 0.32, 0.98] }}
      className={className}
    >{children}</motion.div>
  );
}

function GradientBg() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute top-[-50%] left-[-20%] w-[70%] h-[100%] rounded-full opacity-30 blur-3xl animate-float" style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.15) 0%, transparent 70%)' }} />
      <div className="absolute bottom-[-30%] right-[-10%] w-[60%] h-[80%] rounded-full opacity-20 blur-3xl animate-float" style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.12) 0%, transparent 70%)', animationDelay: '-3s' }} />
      <div className="absolute top-[20%] right-[10%] w-[40%] h-[40%] rounded-full opacity-10 blur-3xl animate-glow-pulse" style={{ background: 'radial-gradient(circle, rgba(168,85,247,0.15) 0%, transparent 70%)' }} />
      <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: 'linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
    </div>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);
  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'How It Works', href: '#how' },
    { label: 'Pricing', href: '#pricing' },
    { label: 'Compare', href: '#compare' },
  ];
  return (
    <motion.nav initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}
      className={cn('fixed top-0 inset-x-0 z-50 transition-all duration-500', scrolled ? 'bg-white/80 backdrop-blur-xl shadow-[0_1px_3px_rgba(0,0,0,0.05)] border-b border-gray-200/50' : 'bg-transparent')}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16 lg:h-[72px]">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center text-white text-xs font-black tracking-tight shadow-lg shadow-blue-600/20 group-hover:shadow-blue-600/40 transition-shadow">CS</div>
          <span className="text-lg font-extrabold tracking-tight text-gray-900">CheckSync Pro</span>
        </Link>
        <div className="hidden lg:flex items-center gap-1">
          {navLinks.map((l) => (
            <a key={l.href} href={l.href} className="px-4 py-2 text-[13px] font-medium text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition-all">{l.label}</a>
          ))}
        </div>
        <div className="hidden lg:flex items-center gap-3">
          <Link href="/login" className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-50 transition-all">Log In</Link>
          <Link href="/signup" className="px-5 py-2.5 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg shadow-blue-600/20 hover:shadow-blue-600/40 hover:-translate-y-px transition-all flex items-center gap-1.5">
            Start Free Trial <ArrowRight size={14} />
          </Link>
        </div>
        <button onClick={() => setMobileOpen(!mobileOpen)} className="lg:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors" aria-label="Toggle menu">
          {mobileOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      <AnimatePresence>
        {mobileOpen && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="lg:hidden overflow-hidden bg-white/95 backdrop-blur-xl border-t border-gray-100">
            <div className="px-4 py-4 space-y-1">
              {navLinks.map((l) => (
                <a key={l.href} href={l.href} onClick={() => setMobileOpen(false)} className="block px-4 py-3 text-base font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all">{l.label}</a>
              ))}
              <div className="pt-4 mt-2 border-t border-gray-100 grid grid-cols-2 gap-3">
                <Link href="/login" onClick={() => setMobileOpen(false)} className="text-center py-3 text-sm font-semibold text-gray-700 border border-gray-200 rounded-xl hover:border-gray-300 transition-colors">Log In</Link>
                <Link href="/signup" onClick={() => setMobileOpen(false)} className="text-center py-3 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg shadow-blue-600/20">Free Trial</Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

function Hero() {
  return (
    <section className="relative pt-28 sm:pt-36 lg:pt-44 pb-16 sm:pb-24 px-4 sm:px-6 overflow-hidden">
      <GradientBg />
      <div className="max-w-5xl mx-auto text-center relative">
        <FadeIn>
          <motion.div className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-50/80 backdrop-blur-sm border border-blue-200/60 rounded-full text-[13px] font-semibold text-blue-700 mb-6 sm:mb-8" whileHover={{ scale: 1.03 }}>
            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" /></span>
            Now supporting QuickBooks, Xero, Sage &amp; Zoho
          </motion.div>
        </FadeIn>
        <FadeIn delay={0.1}>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] text-gray-900 mb-6">
            Stop Reconciling Checks{' '}
            <span className="bg-gradient-to-r from-blue-500 via-blue-600 to-indigo-600 bg-clip-text text-transparent bg-[length:200%_auto] animate-gradient-flow">By Hand</span>
          </h1>
        </FadeIn>
        <FadeIn delay={0.2}>
          <p className="text-base sm:text-lg md:text-xl text-gray-500 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed px-4">
            Upload check images, let AI extract the data, and auto-match against QuickBooks in seconds. Save <strong className="text-gray-800 font-semibold">15+ hours per week</strong> per client.
          </p>
        </FadeIn>
        <FadeIn delay={0.3}>
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center mb-4 px-4">
            <Link href="/signup" className="px-6 sm:px-8 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-[14px] shadow-xl shadow-blue-600/25 hover:shadow-blue-600/40 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2">
              Start Free 14-Day Trial <ArrowRight size={18} />
            </Link>
            <motion.a href="#how" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="px-6 sm:px-8 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-gray-700 bg-white border-2 border-gray-200 rounded-[14px] hover:border-blue-300 hover:text-blue-600 transition-all flex items-center justify-center gap-2 shadow-sm">
              See How It Works <ArrowDown size={18} />
            </motion.a>
          </div>
          <p className="text-xs text-gray-400 font-medium">No credit card required &middot; Cancel anytime &middot; Setup in 2 minutes</p>
        </FadeIn>
        <FadeIn delay={0.5}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 mt-12 sm:mt-16 pt-10 sm:pt-12 border-t border-gray-100/80">
            <div className="text-center"><div className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 tracking-tight"><NumberTicker value={98.7} decimalPlaces={1} suffix="%" /></div><div className="text-xs sm:text-sm text-gray-400 mt-1 font-medium">OCR Accuracy</div></div>
            <div className="text-center"><div className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 tracking-tight"><NumberTicker value={15} suffix="hrs" /></div><div className="text-xs sm:text-sm text-gray-400 mt-1 font-medium">Saved Per Week</div></div>
            <div className="text-center"><div className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 tracking-tight"><NumberTicker value={50} suffix="K+" /></div><div className="text-xs sm:text-sm text-gray-400 mt-1 font-medium">Checks Processed</div></div>
            <div className="text-center"><div className="text-2xl sm:text-3xl md:text-4xl font-black text-gray-900 tracking-tight">$<NumberTicker value={0.003} decimalPlaces={3} /></div><div className="text-xs sm:text-sm text-gray-400 mt-1 font-medium">Per Check (avg)</div></div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

const firmLogos = ['Rodriguez & Associates','Thompson Tax Group','Pacific Bookkeeping','Summit Financial','Cascade Accounting','Pinnacle CPA Group','Harbor Tax Services','Evergreen Advisors','Atlas Bookkeeping','NorthStar Financial','Clearview Accounting','Redwood Tax Partners'];

function LogoMarquee() {
  return (
    <section className="py-10 sm:py-16 border-y border-gray-100 bg-gray-50/40">
      <FadeIn><p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400 mb-6 sm:mb-8 px-4">Trusted by 500+ accounting firms worldwide</p></FadeIn>
      <Marquee pauseOnHover className="[--duration:35s]" gap="1rem">
        {firmLogos.map((name) => (
          <div key={name} className="flex items-center gap-2 px-4 sm:px-5 py-2 bg-white rounded-lg border border-gray-100 shadow-sm whitespace-nowrap">
            <div className="w-6 h-6 bg-gradient-to-br from-gray-200 to-gray-300 rounded-md flex items-center justify-center text-[8px] font-bold text-gray-500">{name.split(' ').map(w => w[0]).join('').slice(0, 2)}</div>
            <span className="text-xs sm:text-sm font-semibold text-gray-600">{name}</span>
          </div>
        ))}
      </Marquee>
    </section>
  );
}

function ScreenshotSection() {
  return (
    <section className="px-4 sm:px-6 pb-16 sm:pb-24">
      <FadeIn>
        <div className="max-w-5xl mx-auto relative rounded-2xl overflow-hidden">
          <BorderBeam size={300} duration={12} colorFrom="#2563eb" colorTo="#0ea5e9" />
          <div className="rounded-2xl overflow-hidden shadow-2xl shadow-gray-900/10 border border-gray-200/50">
            <div className="bg-gray-100 px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2">
              <div className="flex gap-1.5"><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-red-400" /><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-amber-400" /><span className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-blue-400" /></div>
              <div className="ml-3 flex-1 bg-white rounded-md px-3 py-1 text-[10px] sm:text-xs text-gray-400 font-mono truncate">app.checksyncpro.com/reconciliation</div>
            </div>
            <div className="bg-gradient-to-br from-[#0a0f1e] via-[#111d35] to-[#0a1a12] p-3 sm:p-6 md:p-8">
              <div className="flex gap-3 sm:gap-4">
                <div className="hidden sm:flex flex-col w-40 md:w-48 bg-white/[0.04] backdrop-blur rounded-xl p-4 gap-2">
                  {['Dashboard','Reconciliation','Upload','QB Match','Analytics','Export','Settings'].map((item, i) => (
                    <div key={item} className={cn('h-8 rounded-lg px-3 flex items-center text-xs font-medium transition-colors', i === 1 ? 'bg-blue-500/20 text-blue-400' : 'text-white/30 hover:bg-white/[0.04]')}>{item}</div>
                  ))}
                </div>
                <div className="flex-1 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2"><div className="h-5 w-28 sm:w-36 bg-white/10 rounded" /><div className="h-4 w-16 bg-blue-500/20 rounded text-[8px] text-blue-400 flex items-center justify-center font-semibold">72% Done</div></div>
                    <div className="flex gap-2"><div className="h-6 w-16 sm:w-20 bg-blue-500/20 rounded" /><div className="h-6 w-14 sm:w-16 bg-white/5 rounded" /></div>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div initial={{ width: '0%' }} whileInView={{ width: '72%' }} transition={{ duration: 1.5, ease: 'easeOut', delay: 0.5 }} viewport={{ once: true }} className="h-full bg-gradient-to-r from-blue-600 to-blue-400 rounded-full" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                    {[{l:'Matched',v:'847',c:'text-blue-400',b:'bg-blue-500/10'},{l:'Pending',v:'156',c:'text-amber-400',b:'bg-amber-500/10'},{l:'Review',v:'23',c:'text-sky-400',b:'bg-sky-500/10'},{l:'Errors',v:'4',c:'text-red-400',b:'bg-red-500/10'}].map((c) => (
                      <div key={c.l} className={cn('rounded-lg p-3 sm:p-4', c.b)}><div className="text-[10px] sm:text-xs text-white/40 font-medium mb-1">{c.l}</div><div className={cn('text-lg sm:text-2xl font-bold', c.c)}>{c.v}</div></div>
                    ))}
                  </div>
                  <div className="bg-white/[0.02] rounded-xl p-3 sm:p-4 space-y-2">
                    {[{ck:'#10482',py:'Fernando L. Ortega',am:'$3,450.00',st:'Matched',sc:'text-blue-400 bg-blue-500/10'},{ck:'#10483',py:'ABC Supply Co.',am:'$1,280.50',st:'Matched',sc:'text-blue-400 bg-blue-500/10'},{ck:'#10484',py:'Pacific Services Inc',am:'$892.00',st:'Review',sc:'text-amber-400 bg-amber-500/10'},{ck:'#10485',py:'Summit Electric LLC',am:'$5,100.00',st:'Matched',sc:'text-blue-400 bg-blue-500/10'},{ck:'#10486',py:'Harbor Construction',am:'$2,340.75',st:'Pending',sc:'text-sky-400 bg-sky-500/10'}].map((r) => (
                      <div key={r.ck} className="flex items-center gap-2 sm:gap-3 py-1.5 sm:py-2 text-[10px] sm:text-xs border-b border-white/[0.03] last:border-0">
                        <span className="text-white/30 font-mono w-12 sm:w-16 shrink-0">{r.ck}</span><span className="text-white/60 flex-1 truncate">{r.py}</span><span className="text-white/50 font-mono w-16 sm:w-20 text-right shrink-0">{r.am}</span><span className={cn('px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-semibold shrink-0', r.sc)}>{r.st}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </FadeIn>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { num: 1, icon: <Upload className="w-6 h-6 sm:w-7 sm:h-7" />, title: 'Upload Check Images', desc: 'Drop a PDF of bank statements or individual check images. Our AI detects and splits individual checks automatically.', color: 'from-blue-600 to-blue-700' },
    { num: 2, icon: <ScanLine className="w-6 h-6 sm:w-7 sm:h-7" />, title: 'AI Extracts Data', desc: 'Gemini-powered OCR reads check number, date, amount, and payee with 98.7% accuracy. No manual data entry.', color: 'from-sky-500 to-sky-600' },
    { num: 3, icon: <GitCompare className="w-6 h-6 sm:w-7 sm:h-7" />, title: 'Auto-Match & Reconcile', desc: 'Extracted checks auto-match against QuickBooks transactions. Review, approve, and clear — done.', color: 'from-violet-500 to-violet-600' },
  ];
  return (
    <section id="how" className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-b from-gray-50/80 to-white">
      <div className="max-w-5xl mx-auto">
        <FadeIn>
          <div className="text-center mb-12 sm:mb-16">
            <span className="inline-block px-3.5 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-wider mb-4">How It Works</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-gray-900 mb-4">Three Steps to Reconciled</h2>
            <p className="text-base sm:text-lg text-gray-500 max-w-xl mx-auto">From check scan to fully reconciled books in under 60 seconds.</p>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6 sm:gap-8 relative">
          <div className="hidden md:block absolute top-[60px] left-[20%] right-[20%] h-px bg-gradient-to-r from-blue-300 via-sky-300 to-violet-300 opacity-40" />
          {steps.map((s, i) => (
            <FadeIn key={s.num} delay={i * 0.15}>
              <motion.div whileHover={{ y: -4 }} className="text-center relative bg-white rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-sm hover:shadow-xl hover:border-gray-200 transition-all duration-300">
                <div className={cn('w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br rounded-2xl flex items-center justify-center text-white mx-auto mb-5 shadow-lg relative z-10', s.color)}>{s.icon}</div>
                <div className="absolute top-4 right-4 text-4xl sm:text-5xl font-black text-gray-100 select-none">{s.num}</div>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2">{s.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{s.desc}</p>
              </motion.div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    { icon: <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />, title: 'AI-Powered OCR', desc: 'Gemini AI reads handwritten and printed checks with 98.7% accuracy. Handles poor scans, stamps, and endorsements.', color: 'from-blue-600 to-blue-700', span: 'md:col-span-2' },
    { icon: <RefreshCw className="w-5 h-5 sm:w-6 sm:h-6" />, title: 'QuickBooks Integration', desc: 'One-click connection to QuickBooks Online. Pull BillPayments, Purchases, and Check entities automatically.', color: 'from-blue-500 to-blue-600', span: '' },
    { icon: <Search className="w-5 h-5 sm:w-6 sm:h-6" />, title: 'Smart Matching', desc: 'Fuzzy matching on names, amounts, dates, and check numbers. Catches "FERNANDO L ORTEGA" vs "FERNANDO LOPEZ ORTEGA."', color: 'from-purple-500 to-purple-600', span: '' },
    { icon: <Users className="w-5 h-5 sm:w-6 sm:h-6" />, title: 'Multi-Client Support', desc: 'Switch between client companies instantly. Perfect for accounting firms managing dozens of businesses.', color: 'from-amber-500 to-amber-600', span: 'md:col-span-2' },
    { icon: <Shield className="w-5 h-5 sm:w-6 sm:h-6" />, title: 'Duplicate Detection', desc: 'Automatically flags potential duplicate checks before they become costly errors in your books.', color: 'from-red-500 to-red-600', span: '' },
    { icon: <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6" />, title: 'Export Anywhere', desc: 'Export to CSV, QuickBooks Desktop (.iif), QuickBooks Online, Xero, Zoho Books, or Sage formats.', color: 'from-teal-500 to-teal-600', span: '' },
    { icon: <ClipboardCheck className="w-5 h-5 sm:w-6 sm:h-6" />, title: 'Audit Trail', desc: 'Complete log of every action, match, approval, and export. Full compliance for your review processes.', color: 'from-indigo-500 to-indigo-600', span: 'md:col-span-2' },
  ];
  return (
    <section id="features" className="py-16 sm:py-24 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto">
        <FadeIn>
          <div className="text-center mb-12 sm:mb-16">
            <span className="inline-block px-3.5 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-wider mb-4">Features</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-gray-900 mb-4">Everything You Need</h2>
            <p className="text-base sm:text-lg text-gray-500 max-w-xl mx-auto">Built by accountants, for accountants. Every feature designed to save you time.</p>
          </div>
        </FadeIn>
        <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
          {features.map((f, i) => (
            <FadeIn key={f.title} delay={i * 0.08} className={f.span}>
              <motion.div whileHover={{ y: -3, scale: 1.01 }} className="group relative h-full p-5 sm:p-7 rounded-2xl border border-gray-100 hover:border-gray-200 bg-white hover:shadow-xl transition-all duration-300 overflow-hidden">
                <div className={cn('absolute inset-0 opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500 bg-gradient-to-br rounded-2xl', f.color)} />
                <div className={cn('w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-white mb-4 sm:mb-5 shadow-lg', f.color)}>{f.icon}</div>
                <h3 className="text-sm sm:text-base font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </motion.div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function Comparison() {
  const rows = [
    { task: 'Extract data from 100 checks', manual: '3-4 hours', cs: '45 seconds' },
    { task: 'Match checks to QuickBooks', manual: '2-3 hours', cs: 'Instant' },
    { task: 'Identify mismatches', manual: '1-2 hours', cs: 'Instant' },
    { task: 'Switch between companies', manual: 'Logout/Login', cs: 'One click' },
    { task: 'Generate reconciliation report', manual: '30-60 min', cs: 'One click' },
    { task: 'Detect duplicate entries', manual: 'Often missed', cs: 'Automatic' },
  ];
  return (
    <section id="compare" className="py-16 sm:py-24 px-4 sm:px-6 bg-[#0a0f1e] relative overflow-hidden">
      <div className="absolute top-0 left-0 w-[500px] h-[500px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.06) 0%, transparent 70%)' }} />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.04) 0%, transparent 70%)' }} />
      <div className="max-w-4xl mx-auto relative">
        <FadeIn>
          <div className="text-center mb-12 sm:mb-16">
            <span className="inline-block px-3.5 py-1.5 bg-blue-500/10 text-blue-400 rounded-full text-xs font-bold uppercase tracking-wider mb-4">Time Savings</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white mb-4">Manual vs. CheckSync Pro</h2>
            <p className="text-base sm:text-lg text-white/40 max-w-xl mx-auto">See how much time you&apos;re wasting on manual reconciliation.</p>
          </div>
        </FadeIn>
        <FadeIn delay={0.15}>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur overflow-hidden">
            <div className="hidden sm:flex items-center py-4 px-4 sm:px-6 border-b border-white/[0.06]">
              <div className="flex-1 text-xs font-bold uppercase tracking-wider text-white/30">Task</div>
              <div className="w-28 sm:w-36 text-center text-xs font-bold uppercase tracking-wider text-white/20">Manual</div>
              <div className="w-28 sm:w-36 text-center text-xs font-bold uppercase tracking-wider text-blue-400">CheckSync</div>
            </div>
            {rows.map((r, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }} viewport={{ once: true }} className="border-b border-white/[0.03] last:border-0">
                <div className="hidden sm:flex items-center py-4 px-4 sm:px-6 hover:bg-white/[0.02] transition-colors">
                  <div className="flex-1 text-sm text-white/60 font-medium">{r.task}</div>
                  <div className="w-28 sm:w-36 text-center text-sm text-white/25 line-through decoration-white/10">{r.manual}</div>
                  <div className="w-28 sm:w-36 text-center text-sm text-blue-400 font-semibold">{r.cs}</div>
                </div>
                <div className="sm:hidden px-4 py-3 space-y-1.5">
                  <div className="text-sm text-white/60 font-medium">{r.task}</div>
                  <div className="flex justify-between text-xs"><span className="text-white/25 line-through">Manual: {r.manual}</span><span className="text-blue-400 font-semibold">{r.cs}</span></div>
                </div>
              </motion.div>
            ))}
            <div className="flex flex-col sm:flex-row items-start sm:items-center py-4 sm:py-5 px-4 sm:px-6 bg-white/[0.03]">
              <div className="flex-1 text-sm text-white font-bold mb-2 sm:mb-0">Total per 100 checks</div>
              <div className="flex gap-4 sm:gap-0"><div className="sm:w-28 md:w-36 text-center text-sm text-red-400 font-bold">6-9 hours</div><div className="sm:w-28 md:w-36 text-center text-sm sm:text-base text-blue-400 font-extrabold">Under 2 min</div></div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function Pricing() {
  const plans = [
    { tier: 'Starter', price: 49, desc: 'For solo accountants and small firms', popular: false, features: ['500 checks per month','1 user','1 QuickBooks connection','AI-powered OCR extraction','CSV & QB Online export','Email support'] },
    { tier: 'Professional', price: 129, desc: 'For growing firms with multiple clients', popular: true, features: ['2,500 checks per month','5 users with role-based access','Unlimited QB connections','Auto-matching & smart reconciliation','All export formats (Xero, Sage, Zoho)','Duplicate detection','Priority support'] },
    { tier: 'Enterprise', price: 299, desc: 'For large firms and franchises', popular: false, features: ['Unlimited checks','Unlimited users','API access','Custom branding (white label)','SSO / SAML authentication','Dedicated account manager','Custom integrations','SLA guarantee'] },
  ];
  return (
    <section id="pricing" className="py-16 sm:py-24 px-4 sm:px-6 bg-gradient-to-b from-white to-gray-50/50">
      <div className="max-w-5xl mx-auto">
        <FadeIn>
          <div className="text-center mb-12 sm:mb-16">
            <span className="inline-block px-3.5 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-wider mb-4">Pricing</span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-gray-900 mb-4">Simple, Transparent Pricing</h2>
            <p className="text-base sm:text-lg text-gray-500 max-w-xl mx-auto">Start free. Upgrade as you grow. No hidden fees.</p>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-5 sm:gap-6">
          {plans.map((p, i) => (
            <FadeIn key={p.tier} delay={i * 0.12}>
              <motion.div whileHover={{ y: -5 }} className={cn('relative rounded-2xl p-6 sm:p-8 transition-all duration-300 bg-white h-full flex flex-col', p.popular ? 'border-2 border-blue-600 shadow-2xl shadow-blue-600/10' : 'border-2 border-gray-100 hover:border-gray-200 hover:shadow-lg')}>
                {p.popular && (<><BorderBeam size={150} duration={8} colorFrom="#2563eb" colorTo="#0ea5e9" /><div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-[10px] sm:text-[11px] font-bold uppercase tracking-wider px-4 py-1 rounded-full shadow-lg">Most Popular</div></>)}
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">{p.tier}</div>
                <div className="text-4xl sm:text-5xl font-black tracking-tight text-gray-900 mb-1">${p.price}<span className="text-sm sm:text-base font-medium text-gray-400 tracking-normal">/mo</span></div>
                <p className="text-xs sm:text-sm text-gray-400 mb-6">{p.desc}</p>
                <ul className="space-y-2.5 sm:space-y-3 mb-8 flex-1">
                  {p.features.map((f) => (<li key={f} className="flex items-start gap-2.5 text-xs sm:text-sm text-gray-600"><Check size={15} className="text-blue-600 mt-0.5 flex-shrink-0" />{f}</li>))}
                </ul>
                <Link href={`/signup?plan=${p.tier.toLowerCase()}`} className={cn('block w-full py-3 rounded-xl text-center text-sm font-bold transition-all', p.popular ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 hover:-translate-y-0.5' : 'border-2 border-gray-200 text-gray-700 hover:border-blue-300 hover:text-blue-600')}>
                  {p.tier === 'Enterprise' ? 'Contact Sales' : 'Start Free Trial'}
                </Link>
              </motion.div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function TestimonialCard({ text, name, role, initials }: { text: string; name: string; role: string; initials: string }) {
  return (
    <div className="w-[280px] sm:w-[360px] bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex gap-0.5 text-amber-400 mb-3">{[...Array(5)].map((_, j) => <Star key={j} size={14} fill="currentColor" />)}</div>
      <p className="text-xs sm:text-sm text-gray-600 leading-relaxed mb-5">&ldquo;{text}&rdquo;</p>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white text-[10px] sm:text-xs font-bold">{initials}</div>
        <div><div className="text-xs sm:text-sm font-bold text-gray-900">{name}</div><div className="text-[10px] sm:text-xs text-gray-400">{role}</div></div>
      </div>
    </div>
  );
}

function Testimonials() {
  const testimonials = [
    { text: 'We used to spend 8 hours a week reconciling checks for our farm service clients. CheckSync Pro cut that down to 20 minutes.', name: 'Maria Rodriguez', role: 'CPA, Rodriguez & Associates', initials: 'MR' },
    { text: 'The QuickBooks integration is seamless. We manage 30+ companies and can switch between them instantly.', name: 'James Thompson', role: 'Partner, Thompson Tax Group', initials: 'JT' },
    { text: 'The fuzzy name matching saved us from so many false mismatches. It knows that "FERNANDO L ORTEGA" and "FERNANDO LOPEZ ORTEGA" are the same person.', name: 'Sarah Kim', role: 'Staff Accountant, Pacific Bookkeeping', initials: 'SK' },
    { text: 'Our tax season went from chaos to calm. We process 2,000+ checks per month now with zero errors. The ROI was obvious within the first week.', name: 'David Chen', role: 'Managing Partner, Chen & Associates', initials: 'DC' },
    { text: 'The Chrome extension is a game-changer. We can reconcile checks right inside QuickBooks Online without switching tabs.', name: 'Lisa Patel', role: 'Senior Accountant, Patel Tax Services', initials: 'LP' },
    { text: 'Customer support is amazing. They helped us migrate in one afternoon. The duplicate detection alone saves us hours every week.', name: 'Robert Nakamura', role: 'Controller, Cascade Financial', initials: 'RN' },
  ];
  return (
    <section className="py-16 sm:py-24 overflow-hidden">
      <FadeIn><div className="text-center mb-10 sm:mb-14 px-4">
        <span className="inline-block px-3.5 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-bold uppercase tracking-wider mb-4">Testimonials</span>
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-gray-900 mb-4">Trusted by Firms Like Yours</h2>
        <p className="text-base sm:text-lg text-gray-500 max-w-xl mx-auto">See why accounting professionals are switching to CheckSync Pro.</p>
      </div></FadeIn>
      <Marquee pauseOnHover className="[--duration:30s] mb-4" gap="1rem">
        {testimonials.slice(0, 3).map((t) => <TestimonialCard key={t.name} {...t} />)}
      </Marquee>
      <Marquee pauseOnHover reverse className="[--duration:30s]" gap="1rem">
        {testimonials.slice(3).map((t) => <TestimonialCard key={t.name} {...t} />)}
      </Marquee>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-16 sm:py-24 px-4 sm:px-6">
      <FadeIn>
        <div className="max-w-4xl mx-auto relative rounded-3xl overflow-hidden">
          <div className="bg-gradient-to-br from-[#0a0f1e] via-[#111d35] to-[#0a1e15] p-8 sm:p-12 md:p-16 text-center relative">
            <div className="absolute top-[-80px] right-[-80px] w-[250px] h-[250px] sm:w-[300px] sm:h-[300px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.2) 0%, transparent 70%)' }} />
            <div className="absolute bottom-[-60px] left-[-60px] w-[200px] h-[200px] sm:w-[250px] sm:h-[250px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.1) 0%, transparent 70%)' }} />
            <div className="relative">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight mb-4">Ready to Stop Reconciling By Hand?</h2>
              <p className="text-sm sm:text-lg text-white/50 mb-8 max-w-xl mx-auto">Join hundreds of accounting firms saving 15+ hours per week. Start your free 14-day trial today.</p>
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
                <Link href="/signup" className="px-6 sm:px-8 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-white bg-gradient-to-r from-blue-600 to-blue-700 rounded-[14px] shadow-xl shadow-blue-600/30 hover:shadow-blue-600/50 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2">
                  Start Free Trial <ArrowRight size={18} />
                </Link>
                <Link href="/login" className="px-6 sm:px-8 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-white border-2 border-white/15 rounded-[14px] hover:border-white/30 transition-all flex items-center justify-center gap-2">Log In</Link>
              </div>
            </div>
          </div>
          <BorderBeam size={250} duration={10} colorFrom="#2563eb" colorTo="#0ea5e9" />
        </div>
      </FadeIn>
    </section>
  );
}

function Footer() {
  const footerLinks: Record<string, { label: string; href: string }[]> = {
    Product: [{ label: 'Features', href: '#features' },{ label: 'Pricing', href: '#pricing' },{ label: 'How It Works', href: '#how' }],
    Legal: [{ label: 'Privacy Policy', href: '/privacy' },{ label: 'Terms of Service', href: '/terms' }],
  };
  return (
    <footer className="border-t border-gray-100 px-4 sm:px-6 bg-white">
      <div className="max-w-7xl mx-auto py-10 sm:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12">
          <div className="col-span-2 md:col-span-2">
            <div className="flex items-center gap-2.5 mb-4"><div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center text-white text-[10px] font-black shadow-sm">CS</div><span className="text-base font-extrabold text-gray-900">CheckSync Pro</span></div>
            <p className="text-sm text-gray-400 leading-relaxed max-w-xs">AI-powered check reconciliation for modern accounting firms. Built by iTax Hub.</p>
          </div>
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3 sm:mb-4">{title}</h4>
              <div className="space-y-2 sm:space-y-2.5">{links.map((l) => (<a key={l.label} href={l.href} className="block text-xs sm:text-sm text-gray-500 hover:text-gray-900 transition-colors">{l.label}</a>))}</div>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 mt-8 sm:mt-12 pt-6 flex flex-col sm:flex-row justify-between gap-2 text-xs text-gray-400">
          <span>&copy; 2026 iTax Hub. All rights reserved.</span><span>CheckSync Pro v1.0.0</span>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 overflow-x-hidden">
      <Nav />
      <Hero />
      <LogoMarquee />
      <ScreenshotSection />
      <HowItWorks />
      <Features />
      <Comparison />
      <Pricing />
      <Testimonials />
      <CTASection />
      <Footer />
    </div>
  );
}
