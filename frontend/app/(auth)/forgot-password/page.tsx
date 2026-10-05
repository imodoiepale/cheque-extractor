'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, CheckCircle, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, GlassCard, Input } from '@/components/ui';

/**
 * Request a password-reset link.
 *
 * Same form-state treatment as login/signup: Field + Input, one form-level
 * alert, `Button loading` while submitting. Success is a separate panel
 * rather than a toast — the instruction ("check your email, it expires in an
 * hour") has to stay on screen.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <GlassCard padding="none" className="p-6 text-center sm:p-8">
        <span
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-bg"
          aria-hidden
        >
          <CheckCircle className="h-7 w-7 text-success-text" />
        </span>
        <h1 className="font-heading text-2xl font-semibold text-ink-strong">Check your email</h1>
        <p className="mt-2 text-sm text-ink-body">
          We sent a password reset link to <strong className="text-ink-strong">{email}</strong>
        </p>
        <p className="mt-3 text-sm text-ink-faint">
          Click the link in the email to reset your password. The link expires in one hour.
        </p>
        <Link href="/login" className="mt-6 inline-flex">
          <Button variant="secondary" size="sm" icon={<ArrowLeft size={16} />}>
            Back to sign in
          </Button>
        </Link>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding="none" className="p-6 sm:p-8">
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-body transition-colors duration-quick ease-settle hover:text-ink-strong"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to sign in
      </Link>

      <div className="mb-7 mt-6 text-center">
        <span
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-wash"
          aria-hidden
        >
          <Mail className="h-6 w-6 text-brand-deep" />
        </span>
        <h1 className="font-heading text-2xl font-semibold text-ink-strong sm:text-3xl">
          Forgot password?
        </h1>
        <p className="mt-1.5 text-sm text-ink-body">
          No problem — we&apos;ll send you reset instructions.
        </p>
      </div>

      <form onSubmit={handleResetPassword} className="space-y-5" noValidate>
        {error ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-input border border-error-border bg-error-bg px-3.5 py-3 text-sm text-error-text"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{error}</span>
          </div>
        ) : null}

        <Field label="Email address" htmlFor="email" required>
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

        <Button type="submit" block loading={loading}>
          {loading ? 'Sending…' : 'Send Reset Link'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-ink-body">
        Remember your password?{' '}
        <Link href="/login" className="font-semibold text-brand-deep hover:underline">
          Sign in
        </Link>
      </p>
    </GlassCard>
  );
}
