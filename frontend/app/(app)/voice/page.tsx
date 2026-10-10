'use client';

/**
 * Kyriq Voice (beta). Ask about your reconciliation out loud; the agent looks
 * things up with read-only tools over your firm's data and answers in speech.
 * Speech-to-text is the browser's Web Speech API (Chrome/Edge); there is always
 * a text box. Replies play Fish Audio mp3 when the service returns one, else
 * the browser's own voice.
 */
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, Send, Loader2, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

type Turn = { role: 'user' | 'assistant'; content: string; tools?: { name: string; rows: unknown[] }[] };

const SUGGESTIONS = [
  'Which checks need attention?',
  'How many exact matches do we have?',
  'Read me check 1042.',
  'Show payments to Harbor Supply over $1,000.',
];

// The Web Speech API is not in lib.dom for every TS target.
type Recognition = { lang: string; interimResults: boolean; onresult: (e: any) => void; onend: () => void; onerror: () => void; start: () => void; stop: () => void };

export default function VoicePage() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [turns, busy]);

  const SR = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null;

  function say(text: string, audio?: string | null) {
    if (!speak) return;
    if (audio) {
      new Audio(`data:audio/mpeg;base64,${audio}`).play().catch(() => {});
    } else if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    }
  }

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError(null);
    const next: Turn[] = [...turns, { role: 'user', content: q }];
    setTurns(next);
    setInput('');
    setBusy(true);
    try {
      const r = await fetch('/api/voice/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speak, messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.detail || data.error || `Voice service error ${r.status}`);
      setTurns([...next, { role: 'assistant', content: data.reply, tools: data.tools }]);
      say(data.reply, data.audio);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  function toggleMic() {
    if (!SR) return;
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec: Recognition = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.onresult = (e: any) => ask(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink-strong">Kyriq Voice <span className="ml-1 rounded-full bg-brand-wash px-2 py-0.5 align-middle text-[11px] font-semibold text-brand-deep">Beta</span></h1>
          <p className="text-[13px] text-ink-soft">Ask about your checks and matches. Read-only: it looks things up, it never approves or clears.</p>
        </div>
        <button
          onClick={() => setSpeak((s) => !s)}
          className="press rounded-input p-2 text-ink-soft hover:bg-ink-strong/[0.06]"
          aria-label={speak ? 'Mute spoken replies' : 'Turn on spoken replies'}
        >
          {speak ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </div>

      <div className="glass-card flex-1 space-y-3 overflow-y-auto rounded-card p-4">
        {turns.length === 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)} className="press rounded-input border border-glass-hairline bg-surface px-3 py-2.5 text-left text-[13px] text-ink-body hover:border-brand">
                &ldquo;{s}&rdquo;
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[85%] rounded-card px-4 py-2.5 text-[14px] leading-relaxed', t.role === 'user' ? 'bg-brand text-white' : 'bg-surface text-ink-body border border-glass-hairline')}>
              {t.content}
              {!!t.tools?.length && (
                <details className="mt-2 text-[11px] text-ink-faint">
                  <summary className="cursor-pointer">Looked up {t.tools.map((x) => x.name).join(', ')}</summary>
                  <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap">{JSON.stringify(t.tools.map((x) => x.rows), null, 1)}</pre>
                </details>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-[13px] text-ink-faint"><Loader2 size={14} className="animate-spin" /> Looking that up…</div>}
        {error && <div className="rounded-input bg-error-bg px-3 py-2 text-[13px] text-error-text">{error}</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); ask(input); }} className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMic}
          disabled={!SR || busy}
          title={SR ? 'Speak' : 'Voice input needs Chrome or Edge'}
          className={cn('press flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white disabled:opacity-40', listening ? 'animate-pulse bg-error' : 'bg-brand')}
          aria-label={listening ? 'Stop listening' : 'Start speaking'}
        >
          {listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Or type a question…"
          className="h-11 flex-1 rounded-pill border border-glass-hairline bg-surface px-4 text-[14px] text-ink-strong outline-none focus:border-brand"
        />
        <button type="submit" disabled={busy || !input.trim()} className="press flex h-11 w-11 items-center justify-center rounded-full bg-ink-strong text-white disabled:opacity-40" aria-label="Send">
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
