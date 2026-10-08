'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CheckCircle, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button, Field, GlassCard, Input } from '@/components/ui';

/**
 * Set a new password.
 *
 * The minimum is the SAME constant as signup — a reset flow that accepts a
 * shorter password than signup is a policy hole, not a convenience, and the
 * two drifted apart here before (6 vs 8).
 *
 * Form-state treatment as established in login/signup: per-field `error` +
 * `state="invalid"`, cleared on the next keystroke, and `Button loading`.
 */
const PASSWORD_MIN = 8;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const next: typeof errors = {};
    if (password.length < PASSWORD_MIN) {
      next.password = `Password must be at least ${PASSWORD_MIN} characters`;
    }
    if (password !== confirmPassword) next.confirmPassword = 'Passwords do not match';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      setSuccess(true);

      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } catch (err: any) {
      setFormError(err.message);
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
        <h1 className="font-heading text-2xl font-semibold text-ink-strong">Password updated</h1>
        <p className="mt-2 text-sm text-ink-body">Your password has been reset.</p>
        <p className="mt-3 text-sm text-ink-faint">Taking you to sign in…</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding="none" className="p-6 sm:p-8">
      <div className="mb-7 text-center">
        <span
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-wash"
          aria-hidden
        >
          <Lock className="h-6 w-6 text-brand-deep" />
        </span>
        <h1 className="font-heading text-2xl font-semibold text-ink-strong sm:text-3xl">
          Set a new password
        </h1>
        <p className="mt-1.5 text-sm text-ink-body">Enter your new password below.</p>
      </div>

      <form onSubmit={handleResetPassword} className="space-y-4" noValidate>
        {formError ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-input border border-error-border bg-error-bg px-3.5 py-3 text-sm text-error-text"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{formError}</span>
          </div>
        ) : null}

        <Field
          label="New password"
          htmlFor="password"
          required
          error={errors.password}
          hint={`At least ${PASSWORD_MIN} characters`}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setErrors((prev) => (prev.password ? { ...prev, password: undefined } : prev));
            }}
            placeholder="Enter new password"
            minLength={PASSWORD_MIN}
            state={errors.password ? 'invalid' : 'default'}
            aria-describedby={errors.password ? 'password-error' : undefined}
          />
        </Field>

        <Field
          label="Confirm new password"
          htmlFor="confirmPassword"
          required
          error={errors.confirmPassword}
        >
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setErrors((prev) =>
                prev.confirmPassword ? { ...prev, confirmPassword: undefined } : prev
              );
            }}
            placeholder="Confirm new password"
            minLength={PASSWORD_MIN}
            state={errors.confirmPassword ? 'invalid' : 'default'}
            aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
          />
        </Field>

        <Button type="submit" block loading={loading}>
          {loading ? 'Resetting password…' : 'Reset Password'}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-semibold text-brand-deep hover:underline">
          Back to sign in
        </Link>
      </p>
    </GlassCard>
  );
}
