'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, GlassCard, Input, Skeleton } from '@/components/ui';

/**
 * Sign in.
 *
 * The form-state treatment here is the one parcel D establishes for every
 * form surface in the app (see also signup / forgot / reset):
 *
 *  - every control is a `Field` + `Input`, so the label is wired by `htmlFor`
 *    and the message is announced, not merely coloured;
 *  - field-level problems set BOTH `Input state="invalid"` and `Field error`,
 *    never the border alone;
 *  - the error clears on the next keystroke, so a corrected field stops
 *    shouting before submit;
 *  - one form-level alert sits above the fields for anything the server says;
 *  - submitting is `Button loading`, which swaps the icon in a fixed-width
 *    slot — the button never reflows and never goes blank.
 */

/** Form-level alert. Error colour is paired with an icon and `role="alert"`. */
function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-input border border-error-border bg-error-bg px-3.5 py-3 text-sm text-error-text"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </div>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [redirectTo, setRedirectTo] = useState('/dashboard');

  useEffect(() => {
    const redirect = searchParams?.get('redirectTo');
    if (redirect) {
      setRedirectTo(redirect);
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // Small delay to ensure cookies are set
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Use window.location for full page reload to ensure session is set
      window.location.href = redirectTo;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <GlassCard padding="none" className="p-6 sm:p-8">
      <div className="mb-7 text-center">
        <h1 className="font-heading text-2xl font-semibold text-ink-strong sm:text-3xl">
          Welcome back
        </h1>
        <p className="mt-1.5 text-sm text-ink-body">Sign in to your Kyriq account</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-5" noValidate>
        {error ? <FormAlert>{error}</FormAlert> : null}

        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError('');
            }}
            placeholder="you@yourfirm.com"
            state={error ? 'invalid' : 'default'}
            required
          />
        </Field>

        {/* The reset link lives in the hint slot, not inside the <label> — a
            link inside a label steals the click that should focus the input. */}
        <Field
          label="Password"
          htmlFor="password"
          required
          hint={
            <span className="block text-right">
              <Link
                href="/forgot-password"
                className="font-medium text-brand-deep hover:underline"
              >
                Forgot password?
              </Link>
            </span>
          }
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            state={error ? 'invalid' : 'default'}
            required
          />
        </Field>

        {/* Brand/indigo, matching the website (client change list, item 2). */}
        <Button type="submit" block loading={loading}>
          {loading ? 'Signing in…' : 'Sign In'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-body">
        Don&apos;t have an account?{' '}
        <Link href="/signup" className="font-semibold text-brand-deep hover:underline">
          Start Free Trial
        </Link>
      </p>
    </GlassCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <GlassCard padding="none" className="p-6 sm:p-8">
          <div className="space-y-3 py-8">
            <Skeleton className="mx-auto h-8 w-48" />
            <Skeleton className="mx-auto h-4 w-32" />
          </div>
        </GlassCard>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
