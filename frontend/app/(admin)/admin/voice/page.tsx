'use client';

/**
 * Kyriq Voice (beta): a reconciliation command centre you talk to.
 *
 * The agent (voice/app.py) answers from read-only tools and returns ACTIONS
 * that drive this screen: show a check, show a list, step next/previous,
 * propose an approval or flag, or hand over report rows. Proposals render as
 * confirmation cards; only the user's click calls the app's own routes
 * (/api/matches/...) under their session and role, so the agent itself can
 * never change data. Reports are built here as PDFs (lib/voice/report-pdf.ts)
 * and can be emailed to the signed-in user only.
 *
 * Speech in: Web Speech API (Chrome/Edge), always with a text box.
 * Speech out: Fish Audio mp3 from the service, else the browser voice.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Mic, MicOff, Send, Volume2, VolumeX, ChevronLeft, ChevronRight, Check, Flag, FileDown, Mail, X, Sparkles, Loader2, Play,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ── Types mirrored from voice/app.py ─────────────────────────────────────── */
type MatchLite = { id: string; confidence_score?: number | string | null; status?: string | null; discrepancy_type?: string | null; discrepancy_amount?: number | string | null; flagged_reason?: string | null };
type CheckCard = {
  id?: string; file_url?: string | null; batch_id?: string | null; check_number?: string | null; payee?: string | null; amount?: number | string | null;
  check_date?: string | null; status?: string | null; memo?: string | null; bank_name?: string | null;
  payee_confidence?: number | null; amount_confidence?: number | null; check_date_confidence?: number | null; check_number_confidence?: number | null;
  matches?: MatchLite[] | MatchLite | null;
};
type IssueRow = MatchLite & { checks?: CheckCard | null };
type Action =
  | { kind: 'show_check'; check: CheckCard }
  | { kind: 'show_list'; title: string; list_kind?: string; rows: IssueRow[] }
  | { kind: 'nav'; direction: 'next' | 'previous' }
  | { kind: 'confirm'; action: 'approve_match' | 'approve_all_exact' | 'flag'; label: string; matchId?: string; minConfidence?: number; reason?: string }
  | { kind: 'report'; report: string; title: string; rows: IssueRow[]; summary: Record<string, any>; email: boolean };
type Turn = { role: 'user' | 'assistant'; content: string };
type VoiceOpt = { id: string; name: string; gender: 'male' | 'female'; style: string };
const VOICE_KEY = 'kyriq.voice';
type Phase = 'idle' | 'listening' | 'thinking' | 'speaking';
type Pending = Extract<Action, { kind: 'confirm' }> & { state: 'open' | 'working' | 'done' | 'failed'; note?: string };
type ReportCard = Extract<Action, { kind: 'report' }> & { state: 'ready' | 'working' | 'emailed' | 'failed'; note?: string };

const SUGGESTIONS = ['Where are we?', 'What needs attention?', 'Read me check 1042', 'Approve all the exact matches', 'Email me the discrepancy report'];

const money = (v: unknown) => (v == null || v === '' ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v)));
const pct = (v: unknown) => (v == null ? null : Math.round(Number(v) > 1 ? Number(v) : Number(v) * 100));
const firstMatch = (m: CheckCard['matches']): MatchLite | null => (Array.isArray(m) ? m[0] ?? null : m ?? null);

/* ── Speech recognition typing (not in every lib.dom) ─────────────────────── */
type Recognition = { lang: string; interimResults: boolean; onresult: (e: any) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };

export default function VoicePage() {
  const reduced = useReducedMotion();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [speak, setSpeak] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<{ title: string; rows: CheckCard[] } | null>(null);
  const [index, setIndex] = useState(0);
  const [single, setSingle] = useState<CheckCard | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [reports, setReports] = useState<ReportCard[]>([]);
  const [voices, setVoices] = useState<VoiceOpt[]>([]);
  const [voiceId, setVoiceId] = useState<string>('');
  const [previewing, setPreviewing] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const focus: CheckCard | null = list ? list.rows[index] ?? null : single;

  // Curated Fish Audio voices; the choice is a per-viewer convenience, kept in
  // localStorage (wrapped: it can throw in private windows).
  useEffect(() => {
    fetch('/api/voice/voices').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d?.voices) return;
      setVoices(d.voices);
      let saved = '';
      try { saved = localStorage.getItem(VOICE_KEY) || ''; } catch { /* storage unavailable */ }
      setVoiceId(d.voices.some((v: VoiceOpt) => v.id === saved) ? saved : d.default);
    }).catch(() => {});
  }, []);
  function chooseVoice(id: string) {
    setVoiceId(id);
    try { localStorage.setItem(VOICE_KEY, id); } catch { /* storage unavailable */ }
  }
  async function previewVoice() {
    if (!voiceId || previewing) return;
    setPreviewing(true);
    try {
      const r = await fetch('/api/voice/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voice_id: voiceId }) });
      const d = await r.json().catch(() => ({}));
      if (d.audio) { audioRef.current?.pause(); const a = new Audio(`data:audio/mpeg;base64,${d.audio}`); audioRef.current = a; a.onended = () => setPreviewing(false); await a.play(); return; }
      setError(d.detail || d.error || 'Voice preview is unavailable.');
    } catch { setError('Voice preview is unavailable.'); }
    setPreviewing(false);
  }
  useEffect(() => endRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }), [turns, pending, reports, reduced]);

  const SR = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

  const say = useCallback((text: string, audio?: string | null) => {
    if (!speak || !text) return setPhase('idle');
    setPhase('speaking');
    const done = () => setPhase('idle');
    if (audio) {
      audioRef.current?.pause();
      const a = new Audio(`data:audio/mpeg;base64,${audio}`);
      audioRef.current = a;
      a.onended = done;
      a.play().catch(done);
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.onend = done;
      window.speechSynthesis.speak(u);
    } else done();
  }, [speak]);

  const applyActions = useCallback((actions: Action[]) => {
    for (const a of actions) {
      if (a.kind === 'show_check') { setList(null); setSingle(a.check); }
      if (a.kind === 'show_list') {
        const rows = a.rows.map((r) => ({ ...(r.checks ?? {}), matches: { id: r.id, confidence_score: r.confidence_score, status: r.status, discrepancy_type: r.discrepancy_type, discrepancy_amount: r.discrepancy_amount, flagged_reason: r.flagged_reason } }));
        setList({ title: a.title, rows }); setIndex(0); setSingle(null);
      }
      if (a.kind === 'nav') setIndex((i) => (a.direction === 'next' ? i + 1 : i - 1));
      if (a.kind === 'confirm') setPending((p) => [...p, { ...a, state: 'open' }]);
      if (a.kind === 'report') setReports((r) => [...r, { ...a, state: 'ready' }]);
    }
  }, []);

  useEffect(() => {
    if (list) setIndex((i) => Math.max(0, Math.min(i, list.rows.length - 1)));
  }, [list, index]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || phase === 'thinking') return;
    setError(null);
    const next: Turn[] = [...turns, { role: 'user', content: q }];
    setTurns(next);
    setInput('');
    setPhase('thinking');
    try {
      const r = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speak, voice_id: voiceId || null, messages: next, focus: focus ? { check_number: focus.check_number } : null }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || data.error || `Voice service error ${r.status}`);
      setTurns([...next, { role: 'assistant', content: data.reply }]);
      applyActions(data.actions ?? []);
      say(data.reply, data.audio);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Something went wrong';
      setError(msg);
      const spoken = /unavailable|credit|quota/i.test(msg)
        ? "I can't think right now: the AI provider is out of credit. Ask an administrator to top it up."
        : "Sorry, I couldn't reach Kyriq Voice just now.";
      setTurns((t) => [...t, { role: 'assistant', content: spoken }]);
      say(spoken);
    }
  }

  function toggleMic() {
    if (!SR) return;
    if (phase === 'listening') return recRef.current?.stop();
    audioRef.current?.pause();
    window.speechSynthesis?.cancel();
    const rec: Recognition = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (e: any) => ask(e.results[0][0].transcript);
    rec.onend = () => setPhase((p) => (p === 'listening' ? 'idle' : p));
    rec.onerror = () => setPhase('idle');
    recRef.current = rec;
    setPhase('listening');
    rec.start();
  }

  /* The ONLY place data changes: the user's own click, through the app's routes. */
  async function confirm(i: number) {
    const p = pending[i];
    setPending((all) => all.map((x, j) => (j === i ? { ...x, state: 'working' } : x)));
    let url = '', body: Record<string, unknown> = {};
    if (p.action === 'approve_match') { url = `/api/matches/${p.matchId}/approve`; }
    if (p.action === 'approve_all_exact') { url = '/api/matches/bulk-approve'; body = { minConfidence: p.minConfidence ?? 100 }; }
    if (p.action === 'flag') { url = `/api/matches/${p.matchId}/flag`; body = { reason: p.reason }; }
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const ok = !!r?.ok;
    const data = await r?.json().catch(() => ({}));
    setPending((all) => all.map((x, j) => (j === i ? { ...x, state: ok ? 'done' : 'failed', note: ok ? undefined : data?.error || 'Not allowed or failed' } : x)));
    const line = ok ? (p.action === 'flag' ? 'Flagged.' : 'Approved. Approved checks are cleared from the Approve step.') : 'That did not go through.';
    setTurns((t) => [...t, { role: 'assistant', content: line }]);
    say(line);
  }

  async function report(i: number, mode: 'download' | 'email') {
    const rc = reports[i];
    setReports((all) => all.map((x, j) => (j === i ? { ...x, state: 'working' } : x)));
    try {
      const { buildReportPdf } = await import('@/lib/voice/report-pdf');
      const pdf = await buildReportPdf({ title: rc.title, rows: rc.rows, summary: rc.summary });
      if (mode === 'download') {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(pdf.blob);
        a.download = pdf.filename;
        a.click();
        setReports((all) => all.map((x, j) => (j === i ? { ...x, state: 'ready' } : x)));
        return;
      }
      const r = await fetch('/api/voice/email-report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: rc.title, filename: pdf.filename, pdfBase64: pdf.base64 }) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Email failed');
      setReports((all) => all.map((x, j) => (j === i ? { ...x, state: 'emailed', note: `Sent to ${data.to}` } : x)));
      say(`Sent. It's in your inbox at ${data.to}.`);
    } catch (e) {
      setReports((all) => all.map((x, j) => (j === i ? { ...x, state: 'failed', note: e instanceof Error ? e.message : 'Failed' } : x)));
    }
  }

  return (
    <div className="relative isolate overflow-hidden rounded-3xl border border-white/[0.06] bg-[#0b0f14] text-white">
      <Stage reduced={!!reduced} phase={phase} />

      <div className="relative z-10 grid gap-5 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* LEFT: orb + conversation */}
        <section className="flex min-w-0 flex-col">
          <header className="mb-2 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300/90">Kyriq Voice · Beta</p>
              <h1 className="text-2xl font-bold tracking-tight">Reconcile out loud</h1>
            </div>
            <div className="flex items-center gap-2">
              {voices.length > 0 && (
                <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 py-1 pl-3 pr-1">
                  <label htmlFor="voice" className="sr-only">Voice</label>
                  <select id="voice" value={voiceId} onChange={(e) => chooseVoice(e.target.value)} className="max-w-[170px] bg-transparent text-[13px] text-white/90 outline-none [&>optgroup]:bg-slate-900 [&>optgroup>option]:bg-slate-900">
                    {(['female', 'male'] as const).map((g) => (
                      <optgroup key={g} label={g === 'female' ? 'Female voices' : 'Male voices'}>
                        {voices.filter((v) => v.gender === g).map((v) => <option key={v.id} value={v.id}>{v.name} · {v.style}</option>)}
                      </optgroup>
                    ))}
                  </select>
                  <button onClick={previewVoice} disabled={previewing} className="press grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-50" aria-label="Preview this voice">
                    {previewing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  </button>
                </div>
              )}
              <button onClick={() => setSpeak((s) => !s)} className="press rounded-full border border-white/10 bg-white/5 p-2.5 text-white/80 hover:bg-white/10" aria-label={speak ? 'Mute spoken replies' : 'Turn on spoken replies'}>
                {speak ? <Volume2 size={18} /> : <VolumeX size={18} />}
              </button>
            </div>
          </header>

          <Orb phase={phase} reduced={!!reduced} onClick={toggleMic} disabled={!SR} />

          <div className="mt-2 h-[min(46vh,460px)] space-y-3 overflow-y-auto rounded-3xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-xl">
            {turns.length === 0 && (
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="press rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[13px] text-white/80 transition hover:border-indigo-400/60 hover:bg-indigo-500/10">
                    &ldquo;{s}&rdquo;
                  </button>
                ))}
              </div>
            )}
            <AnimatePresence initial={false}>
              {turns.map((t, i) => (
                <motion.div key={i} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div className={cn('max-w-[88%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed', t.role === 'user' ? 'bg-indigo-500 text-white' : 'border border-white/10 bg-white/[0.06] text-white/90')}>{t.content}</div>
                </motion.div>
              ))}
            </AnimatePresence>

            {pending.map((p, i) => (
              <motion.div key={`p${i}`} initial={reduced ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.07] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Needs your confirmation</p>
                <p className="mt-1 text-[14px] text-white">{p.label}</p>
                <div className="mt-3 flex items-center gap-2">
                  {p.state === 'open' && (
                    <>
                      <button onClick={() => confirm(i)} className="press inline-flex items-center gap-1.5 rounded-full bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-400">
                        {p.action === 'flag' ? <Flag size={14} /> : <Check size={14} />} Confirm
                      </button>
                      <button onClick={() => setPending((all) => all.filter((_, j) => j !== i))} className="press inline-flex items-center gap-1 rounded-full px-3 py-2 text-[13px] text-white/60 hover:text-white"><X size={14} /> Cancel</button>
                    </>
                  )}
                  {p.state === 'working' && <span className="inline-flex items-center gap-2 text-[13px] text-white/70"><Loader2 size={14} className="animate-spin" /> Working…</span>}
                  {p.state === 'done' && <span className="text-[13px] font-semibold text-emerald-300">Done</span>}
                  {p.state === 'failed' && <span className="text-[13px] text-rose-300">{p.note}</span>}
                </div>
              </motion.div>
            ))}

            {reports.map((r, i) => (
              <motion.div key={`r${i}`} initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-indigo-400/30 bg-indigo-500/[0.08] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-300">Report ready</p>
                <p className="mt-1 text-[14px] text-white">{r.title} · {r.rows.length} rows</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button disabled={r.state === 'working'} onClick={() => report(i, 'download')} className="press inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-slate-900 disabled:opacity-50"><FileDown size={14} /> Download PDF</button>
                  <button disabled={r.state === 'working' || r.state === 'emailed'} onClick={() => report(i, 'email')} className="press inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"><Mail size={14} /> {r.email ? 'Confirm: email me' : 'Email me'}</button>
                  {r.state === 'working' && <Loader2 size={14} className="animate-spin text-white/70" />}
                  {r.note && <span className={cn('text-[12px]', r.state === 'failed' ? 'text-rose-300' : 'text-emerald-300')}>{r.note}</span>}
                </div>
              </motion.div>
            ))}

            {phase === 'thinking' && <ThinkingDots reduced={!!reduced} />}
            {error && <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200">{error}</div>}
            <div ref={endRef} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="mt-3 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={SR ? 'Tap the orb and talk, or type here…' : 'Type a question (voice input needs Chrome or Edge)…'}
              className="h-12 flex-1 rounded-full border border-white/10 bg-white/[0.05] px-5 text-[14px] text-white placeholder:text-white/40 outline-none focus:border-indigo-400/70"
            />
            <button type="submit" disabled={phase === 'thinking' || !input.trim()} className="press flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500 text-white disabled:opacity-40" aria-label="Send"><Send size={16} /></button>
          </form>
        </section>

        {/* RIGHT: focus panel */}
        <section className="min-w-0 rounded-3xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl lg:sticky lg:top-4 lg:self-start">
          <FocusPanel
            reduced={!!reduced}
            focus={focus}
            list={list}
            index={index}
            onPrev={() => setIndex((i) => Math.max(0, i - 1))}
            onNext={() => setIndex((i) => (list ? Math.min(list.rows.length - 1, i + 1) : i))}
            onAsk={ask}
          />
        </section>
      </div>
    </div>
  );
}

/* ── Stage: slow aurora + grid. Pure CSS/SVG, frozen under reduced motion. ── */
function Stage({ reduced, phase }: { reduced: boolean; phase: Phase }) {
  const hot = phase === 'speaking' || phase === 'listening';
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <motion.div
        className="absolute -left-40 -top-40 h-[640px] w-[640px] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.45), transparent 65%)' }}
        animate={reduced ? undefined : { x: [0, 80, 0], y: [0, 40, 0], opacity: hot ? 0.95 : 0.6 }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute -bottom-48 right-[-10%] h-[620px] w-[620px] rounded-full blur-3xl"
        style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.32), transparent 65%)' }}
        animate={reduced ? undefined : { x: [0, -60, 0], y: [0, -50, 0], opacity: hot ? 0.9 : 0.5 }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '48px 48px', maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)' }} />
    </div>
  );
}

/* ── The orb: the agent's presence. One button; state drives the motion. ──── */
function Orb({ phase, reduced, onClick, disabled }: { phase: Phase; reduced: boolean; onClick: () => void; disabled: boolean }) {
  const label = { idle: disabled ? 'Type below to talk to Kyriq' : 'Tap to talk', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' }[phase];
  const pulse = phase === 'speaking' ? [1, 1.08, 0.97, 1.05, 1] : phase === 'listening' ? [1, 1.04, 1] : phase === 'thinking' ? [1, 0.96, 1] : [1, 1.015, 1];
  return (
    <div className="relative mx-auto my-4 flex flex-col items-center">
      <motion.button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={phase === 'listening' ? 'Stop listening' : 'Start talking'}
        className="relative grid h-44 w-44 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 disabled:cursor-default sm:h-52 sm:w-52"
        animate={reduced ? undefined : { scale: pulse }}
        transition={{ duration: phase === 'speaking' ? 1.1 : 2.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* conic ring */}
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ background: 'conic-gradient(from 0deg, #6366f1, #10b981, #818cf8, #6366f1)', filter: 'blur(1px)', opacity: phase === 'idle' ? 0.55 : 0.95 }}
          animate={reduced ? undefined : { rotate: 360 }}
          transition={{ duration: phase === 'thinking' ? 2.2 : 9, repeat: Infinity, ease: 'linear' }}
        />
        <span className="absolute inset-[3px] rounded-full bg-[hsl(230_45%_6%)]" />
        {/* core */}
        <span className="absolute inset-5 rounded-full" style={{ background: 'radial-gradient(circle at 35% 30%, rgba(165,180,252,0.95), rgba(99,102,241,0.75) 35%, rgba(16,185,129,0.55) 70%, rgba(7,11,24,0.2) 100%)', boxShadow: '0 0 80px rgba(99,102,241,0.55), inset 0 0 40px rgba(255,255,255,0.15)' }} />
        {/* waveform */}
        <span className="relative flex h-14 items-center gap-[5px]">
          {Array.from({ length: 9 }).map((_, i) => (
            <motion.span
              key={i}
              className="w-[5px] rounded-full bg-white/90"
              animate={reduced || phase === 'idle' ? { height: 8 + (i % 3) * 4 } : { height: [10, 18 + ((i * 7) % 30), 8, 24 + ((i * 5) % 22), 10] }}
              transition={{ duration: phase === 'speaking' ? 0.7 : 1.2, repeat: Infinity, delay: i * 0.07, ease: 'easeInOut' }}
            />
          ))}
        </span>
        {phase === 'listening' ? <MicOff className="absolute bottom-7 text-white/80" size={16} /> : <Mic className="absolute bottom-7 text-white/70" size={16} />}
      </motion.button>
      <p className="mt-3 text-[13px] font-medium text-white/70">{label}</p>
    </div>
  );
}

function ThinkingDots({ reduced }: { reduced: boolean }) {
  return (
    <div className="flex items-center gap-1.5 pl-1">
      {[0, 1, 2].map((i) => (
        <motion.span key={i} className="h-2 w-2 rounded-full bg-indigo-300" animate={reduced ? undefined : { opacity: [0.3, 1, 0.3], y: [0, -3, 0] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
      ))}
    </div>
  );
}

/* ── Focus panel: the check on screen, with list stepping ─────────────────── */
function FocusPanel({ focus, list, index, onPrev, onNext, onAsk, reduced }: {
  focus: CheckCard | null; list: { title: string; rows: CheckCard[] } | null; index: number;
  onPrev: () => void; onNext: () => void; onAsk: (q: string) => void; reduced: boolean;
}) {
  const match = focus ? firstMatch(focus.matches) : null;
  const score = match ? pct(match.confidence_score) : null;
  const imgSrc = focus?.file_url || null;
  const fields = useMemo(() => focus ? [
    { k: 'Payee', v: focus.payee || '—', c: pct(focus.payee_confidence) },
    { k: 'Amount', v: money(focus.amount), c: pct(focus.amount_confidence) },
    { k: 'Date', v: focus.check_date ? new Date(`${focus.check_date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—', c: pct(focus.check_date_confidence) },
    { k: 'Check #', v: focus.check_number || '—', c: pct(focus.check_number_confidence) },
    { k: 'Memo', v: focus.memo || '—', c: null },
  ] : [], [focus]);

  if (!focus) {
    return (
      <div className="flex h-full min-h-[50vh] flex-col items-center justify-center text-center">
        <Sparkles className="mb-3 text-indigo-300" size={28} />
        <p className="text-lg font-semibold">Nothing on screen yet</p>
        <p className="mt-1 max-w-sm text-[14px] text-white/60">Say &ldquo;what needs attention?&rdquo; or &ldquo;pull up check 1042&rdquo; and the check, its image and what Kyriq read from it appear here.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-300">{list ? list.title : 'Check'}</p>
          <p className="text-xl font-bold">#{focus.check_number || '—'} · {focus.payee || 'Unknown payee'}</p>
        </div>
        {list && (
          <div className="flex items-center gap-2">
            <button onClick={onPrev} disabled={index === 0} className="press rounded-full border border-white/10 p-2 disabled:opacity-30" aria-label="Previous check"><ChevronLeft size={18} /></button>
            <span className="min-w-[64px] text-center text-[13px] tabular-nums text-white/70">{index + 1} / {list.rows.length}</span>
            <button onClick={onNext} disabled={index >= list.rows.length - 1} className="press rounded-full border border-white/10 p-2 disabled:opacity-30" aria-label="Next check"><ChevronRight size={18} /></button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={`${focus.check_number}-${index}`} initial={reduced ? false : { opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={reduced ? undefined : { opacity: 0, x: -24 }} transition={{ duration: 0.3 }}>
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40">
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imgSrc} alt={`Check ${focus.check_number ?? ''}`} className="max-h-[280px] w-full object-contain" />
            ) : (
              <div className="grid h-40 place-items-center text-[13px] text-white/50">No image for this check</div>
            )}
            {!reduced && <motion.span aria-hidden className="pointer-events-none absolute inset-x-0 h-16 bg-gradient-to-b from-transparent via-emerald-300/20 to-transparent" initial={{ top: '-20%' }} animate={{ top: '110%' }} transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.5, ease: 'easeInOut' }} />}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto]">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {fields.map((f) => (
                <div key={f.k}>
                  <dt className="text-[11px] uppercase tracking-wider text-white/45">{f.k}</dt>
                  <dd className="truncate text-[14px] font-medium text-white">{f.v}</dd>
                  {f.c != null && (
                    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                      <motion.div className={cn('h-full rounded-full', f.c >= 90 ? 'bg-emerald-400' : f.c >= 75 ? 'bg-amber-400' : 'bg-rose-400')} initial={reduced ? false : { width: 0 }} animate={{ width: `${f.c}%` }} transition={{ duration: 0.6 }} />
                    </div>
                  )}
                </div>
              ))}
            </dl>
            <ScoreRing score={score} status={match?.status ?? null} reduced={reduced} />
          </div>

          {match && (match.discrepancy_type || match.flagged_reason) && (
            <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[13px] text-amber-100">
              {match.discrepancy_type && <>Discrepancy: {match.discrepancy_type}{match.discrepancy_amount != null ? `, off by ${money(match.discrepancy_amount)}` : ''}. </>}
              {match.flagged_reason && <>Flag: {match.flagged_reason}</>}
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {match && match.status !== 'approved' && <button onClick={() => onAsk(`Approve check ${focus.check_number}`)} className="press rounded-full bg-emerald-500/90 px-3.5 py-1.5 text-[13px] font-semibold text-white">Approve this</button>}
            <button onClick={() => onAsk(`Flag check ${focus.check_number}`)} className="press rounded-full border border-white/15 px-3.5 py-1.5 text-[13px] text-white/85">Flag</button>
            {list && index < list.rows.length - 1 && <button onClick={onNext} className="press rounded-full border border-white/15 px-3.5 py-1.5 text-[13px] text-white/85">Next</button>}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ScoreRing({ score, status, reduced }: { score: number | null; status: string | null; reduced: boolean }) {
  const r = 38, c = 2 * Math.PI * r, v = Math.max(0, Math.min(100, score ?? 0));
  const color = v >= 100 ? '#10b981' : v >= 90 ? '#34d399' : v >= 75 ? '#fbbf24' : '#fb7185';
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96" aria-label={score == null ? 'No match' : `${score}% match`}>
        <circle cx="48" cy="48" r={r} stroke="rgba(255,255,255,0.1)" strokeWidth="8" fill="none" />
        <motion.circle cx="48" cy="48" r={r} stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" transform="rotate(-90 48 48)"
          strokeDasharray={c} initial={reduced ? false : { strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - v / 100) }} transition={{ duration: 0.8 }} />
        <text x="48" y="53" textAnchor="middle" className="fill-white text-[18px] font-bold">{score == null ? '—' : `${score}%`}</text>
      </svg>
      <span className="mt-1 text-[11px] uppercase tracking-wider text-white/55">{status ?? 'no match'}</span>
    </div>
  );
}
