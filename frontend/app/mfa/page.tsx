'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import {
  Badge,
  Button,
  Field,
  GlassCard,
  GlassCardBody,
  GlassCardTitle,
  GlassPanel,
  Input,
  Skeleton,
} from '@/components/ui';

/**
 * /mfa — the single MFA surface.
 *
 * Three states, decided from the account rather than from a route:
 *   enrol     — no TOTP factor yet: show the QR + secret, verify a code
 *   challenge — a verified factor exists but this session is aal1: verify
 *   done      — session is aal2
 * Plus a recovery path for a lost authenticator.
 *
 * Administrators are forced here by lib/supabase/proxy.ts: any authenticated
 * page request from an admin whose session is not aal2 redirects to /mfa, so
 * enrolment and challenge are both mandatory and there is no page to slip past.
 */
type Phase = 'loading' | 'enrol' | 'challenge' | 'done' | 'recovery';

function MfaFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams?.get('next') || '/dashboard';

  const [phase, setPhase] = useState<Phase>('loading');
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const enrolling = useRef(false);

  const authHeaders = async () => {
    const { data } = await createClient().auth.getSession();
    return {
      'Content-Type': 'application/json',
      ...(data.session?.access_token
        ? { Authorization: `Bearer ${data.session.access_token}` }
        : {}),
    };
  };

  /** Decide the phase, and start enrolment when there is no factor. */
  const bootstrap = useCallback(async () => {
    setError('');
    const supabase = createClient();

    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.currentLevel === 'aal2') {
      setPhase('done');
      return;
    }

    const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors();
    if (listErr) {
      setError(listErr.message);
      setPhase('enrol');
      return;
    }

    const verified = (factors?.totp || []).filter((f) => f.status === 'verified');
    if (verified.length > 0) {
      setFactorId(verified[0].id);
      setPhase('challenge');
      return;
    }

    // Clear out half-finished enrolments, otherwise the "friendly name already
    // exists" error blocks every retry.
    for (const stale of factors?.all || []) {
      if (stale.status !== 'verified') {
        await supabase.auth.mfa.unenroll({ factorId: stale.id });
      }
    }

    if (enrolling.current) return;
    enrolling.current = true;
    const { data: enrolled, error: enrolErr } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      // `issuer` is what the authenticator app shows beside the code. Without
      // it Supabase falls back to the project's site URL, so every code read
      // "localhost:3000" — on the user's phone, next to their real banking
      // tokens. friendlyName is internal (it disambiguates factors in the
      // admin list) and is NOT what the phone displays.
      issuer: 'Kyriq',
      friendlyName: `Kyriq ${new Date().toISOString().slice(0, 10)} ${Math.random()
        .toString(36)
        .slice(2, 6)}`,
    });
    enrolling.current = false;

    if (enrolErr || !enrolled) {
      setError(enrolErr?.message || 'Could not start MFA setup.');
      setPhase('enrol');
      return;
    }

    setFactorId(enrolled.id);
    setQr(enrolled.totp?.qr_code || null);
    setSecret(enrolled.totp?.secret || null);
    setPhase('enrol');
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const verify = async () => {
    if (!factorId) return;
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const supabase = createClient();
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId,
      });
      if (challengeErr || !challenge) throw challengeErr || new Error('Challenge failed');

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: digits,
      });
      if (verifyErr) throw verifyErr;

      // Assert on the resulting level rather than trusting the lack of error.
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData?.currentLevel !== 'aal2') {
        throw new Error('Verification did not raise this session to aal2. Try again.');
      }

      // First-time enrolment: issue recovery codes and show them once.
      const res = await fetch('/api/auth/mfa/recovery-codes', {
        method: 'POST',
        headers: await authHeaders(),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(body?.codes) && body.codes.length > 0) {
        setBackupCodes(body.codes);
        setPhase('done');
      } else {
        setPhase('done');
        router.replace(next);
      }
    } catch (err: any) {
      setError(err?.message || 'That code was not accepted.');
    } finally {
      setBusy(false);
      setCode('');
    }
  };

  const redeemRecovery = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/auth/mfa/recover', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ code: recoveryCode }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) {
        throw new Error(body?.message || 'That recovery code is not valid.');
      }
      setRecoveryCode('');
      setNotice('Authenticator removed. Set up a new one now.');
      setPhase('loading');
      await bootstrap();
    } catch (err: any) {
      setError(err?.message || 'That recovery code is not valid.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await createClient().auth.signOut();
    window.location.href = '/login';
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-center gap-2.5">
          <Image src="/Kyriq_Logo_Files/kyriq-icon.svg" alt="Kyriq" width={32} height={32} className="rounded-lg" />
          <span className="font-heading text-lg font-extrabold tracking-tight">kyriq</span>
        </div>

        <GlassCard padding="lg" reveal className="space-y-5">
          {phase === 'loading' && (
            <div className="space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-11 w-full" />
            </div>
          )}

          {phase === 'enrol' && (
            <>
              <div className="flex items-start justify-between gap-3">
                <GlassCardTitle>Set up two-factor authentication</GlassCardTitle>
                <Badge tone="warning">Required</Badge>
              </div>
              <GlassCardBody>
                Administrators must use an authenticator app. Scan this code with Google
                Authenticator, 1Password, Authy or similar, then enter the 6-digit code it shows.
              </GlassCardBody>

              {notice && <p className="text-sm text-success-text">{notice}</p>}

              {qr && (
                <GlassPanel className="flex flex-col items-center gap-3 rounded-xl p-4">
                  {/* Supabase returns the QR as an SVG data URI. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="Two-factor setup QR code" width={180} height={180} />
                  {secret && (
                    <div className="text-center">
                      <p className="text-eyebrow text-ink-faint">Or enter this key manually</p>
                      <code className="select-all break-all text-xs font-medium">{secret}</code>
                    </div>
                  )}
                </GlassPanel>
              )}

              <Field label="6-digit code" htmlFor="mfa-code" error={error || undefined}>
                <Input
                  id="mfa-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  placeholder="123456"
                  state={error ? 'invalid' : undefined}
                />
              </Field>

              <Button block onClick={verify} disabled={busy || !factorId}>
                {busy ? 'Verifying…' : 'Verify and finish'}
              </Button>
              <button
                type="button"
                onClick={signOut}
                className="w-full text-center text-sm text-ink-faint underline-offset-2 hover:underline"
              >
                Sign out instead
              </button>
            </>
          )}

          {phase === 'challenge' && (
            <>
              <GlassCardTitle>Two-factor verification</GlassCardTitle>
              <GlassCardBody>
                Enter the 6-digit code from your authenticator app to finish signing in.
              </GlassCardBody>

              <Field label="6-digit code" htmlFor="mfa-challenge" error={error || undefined}>
                <Input
                  id="mfa-challenge"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  placeholder="123456"
                  autoFocus
                  state={error ? 'invalid' : undefined}
                />
              </Field>

              <Button block onClick={verify} disabled={busy}>
                {busy ? 'Verifying…' : 'Verify'}
              </Button>
              <button
                type="button"
                onClick={() => { setError(''); setPhase('recovery'); }}
                className="w-full text-center text-sm text-brand-deep underline-offset-2 hover:underline"
              >
                I lost my authenticator
              </button>
              <button
                type="button"
                onClick={signOut}
                className="w-full text-center text-sm text-ink-faint underline-offset-2 hover:underline"
              >
                Sign out instead
              </button>
            </>
          )}

          {phase === 'recovery' && (
            <>
              <GlassCardTitle>Use a recovery code</GlassCardTitle>
              <GlassCardBody>
                Enter one of the recovery codes you saved when you set up two-factor
                authentication. It can only be used once, and it removes your current
                authenticator so you can set up a new one.
              </GlassCardBody>

              <Field label="Recovery code" htmlFor="mfa-recovery" error={error || undefined}>
                <Input
                  id="mfa-recovery"
                  value={recoveryCode}
                  onChange={(e) => setRecoveryCode(e.target.value)}
                  placeholder="ABCDE-FGHJK"
                  autoComplete="off"
                  state={error ? 'invalid' : undefined}
                />
              </Field>

              <Button block onClick={redeemRecovery} disabled={busy || recoveryCode.length < 8}>
                {busy ? 'Checking…' : 'Use recovery code'}
              </Button>
              <button
                type="button"
                onClick={() => { setError(''); setPhase('challenge'); }}
                className="w-full text-center text-sm text-ink-faint underline-offset-2 hover:underline"
              >
                Back
              </button>
            </>
          )}

          {phase === 'done' && (
            <>
              <GlassCardTitle>Two-factor authentication is on</GlassCardTitle>
              {backupCodes ? (
                <>
                  <GlassCardBody>
                    Save these recovery codes somewhere safe. Each one works once, and this is the
                    only time they are shown.
                  </GlassCardBody>
                  <GlassPanel className="rounded-xl p-4">
                    <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                      {backupCodes.map((c) => (
                        <span key={c} className="select-all">{c}</span>
                      ))}
                    </div>
                  </GlassPanel>
                  <Button
                    block
                    variant="secondary"
                    onClick={() => {
                      navigator.clipboard?.writeText(backupCodes.join('\n')).catch(() => {});
                    }}
                  >
                    Copy codes
                  </Button>
                  <Button block onClick={() => router.replace(next)}>
                    I have saved them, continue
                  </Button>
                </>
              ) : (
                <>
                  <GlassCardBody>This session is verified.</GlassCardBody>
                  <Button block onClick={() => router.replace(next)}>
                    Continue
                  </Button>
                </>
              )}
            </>
          )}
        </GlassCard>
      </div>
    </main>
  );
}

export default function MfaPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center px-4">
          <Skeleton className="h-64 w-full max-w-md" />
        </main>
      }
    >
      <MfaFlow />
    </Suspense>
  );
}
