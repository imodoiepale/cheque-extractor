'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Mail, Shield, Zap } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Badge, Button, Field, GlassCard, GlassPanel, Input } from '@/components/ui';

/**
 * Signup — CHECKLIST section 6.
 *
 * First name, last name, firm name, work email, a password of at least EIGHT
 * characters, and a REQUIRED terms-and-privacy consent. No plan picker: the
 * trial is the only thing being started here, and the plan is chosen later in
 * billing.
 *
 * Email confirmation is on in supabase/config.toml, so a successful signUp
 * returns no session. Sending the user to /dashboard would bounce them
 * straight back to /login, so the success state is a verify-your-email panel.
 *
 * Form-state treatment matches the one established in login/page.tsx:
 * Field + Input, `state="invalid"` paired with an announced `error`, the
 * message cleared on the next keystroke, one form-level alert for anything
 * the server says, and `Button loading` for submitting.
 */

/** The password policy. Section 6: at least 8 characters. */
const PASSWORD_MIN = 8;

type FieldName = 'firstName' | 'lastName' | 'firmName' | 'email' | 'password' | 'consent';

export default function SignupPage() {
  const [values, setValues] = useState({
    firstName: '',
    lastName: '',
    firmName: '',
    email: '',
    password: '',
  });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const set = (name: Exclude<FieldName, 'consent'>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [name]: e.target.value }));
    // Correcting a field stops it shouting before the next submit.
    setErrors((prev) => (prev[name] ? { ...prev, [name]: undefined } : prev));
  };

  /** Returns the field errors. Empty object means valid. */
  const validate = () => {
    const next: Partial<Record<FieldName, string>> = {};
    if (!values.firstName.trim()) next.firstName = 'First name is required';
    if (!values.lastName.trim()) next.lastName = 'Last name is required';
    if (!values.firmName.trim()) next.firmName = 'Firm name is required';
    if (!values.email.trim()) next.email = 'Work email is required';
    if (values.password.length < PASSWORD_MIN) {
      next.password = `Password must be at least ${PASSWORD_MIN} characters`;
    }
    if (!consent) next.consent = 'You must accept the Terms and Privacy Policy to continue';
    return next;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setLoading(true);
    try {
      const supabase = createClient();

      const { data, error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password,
        options: {
          data: {
            first_name: values.firstName.trim(),
            last_name: values.lastName.trim(),
            full_name: `${values.firstName.trim()} ${values.lastName.trim()}`.trim(),
            company_name: values.firmName.trim(),
            terms_accepted_at: new Date().toISOString(),
          },
        },
      });

      if (error) throw error;

      // Confirmations are on, so there is normally no session yet. The trial
      // clock starts at verification (section 6), so say so rather than
      // dropping the user on a page that will bounce them to /login.
      if (data.session) {
        window.location.href = '/dashboard';
        return;
      }
      setSentTo(values.email);
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <GlassCard padding="none" className="p-6 text-center sm:p-8">
        <span
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-bg"
          aria-hidden
        >
          <Mail className="h-6 w-6 text-success-text" />
        </span>
        <h1 className="font-heading text-2xl font-semibold text-ink-strong">Confirm your email</h1>
        <p className="mt-2 text-sm text-ink-body">
          We sent a confirmation link to <strong className="text-ink-strong">{sentTo}</strong>.
          Click it to verify your address — your 14-day trial starts then.
        </p>
        <GlassPanel tone="sunken" radius="input" padding="sm" className="mt-5 text-left">
          <p className="text-xs text-ink-body">
            No email after a few minutes? Check your spam folder, then try signing in — we will
            send a fresh link.
          </p>
        </GlassPanel>
        <Link href="/login" className="mt-5 inline-flex">
          <Button variant="secondary" size="sm">
            Go to sign in
          </Button>
        </Link>
      </GlassCard>
    );
  }

  return (
    <GlassCard padding="none" className="p-6 sm:p-8">
      <div className="mb-7 text-center">
        <Badge tone="brand" size="sm" className="mb-3">
          <Zap size={12} aria-hidden /> 14-day free trial &middot; No credit card required
        </Badge>
        <h1 className="font-heading text-2xl font-semibold text-ink-strong sm:text-3xl">
          Start your free trial
        </h1>
        <p className="mt-1.5 text-sm text-ink-body">
          Reconcile cheques against QuickBooks in minutes, not days.
        </p>
      </div>

      <form onSubmit={handleSignup} className="space-y-4" noValidate>
        {formError ? (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-input border border-error-border bg-error-bg px-3.5 py-3 text-sm text-error-text"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>{formError}</span>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="firstName" required error={errors.firstName}>
            <Input
              id="firstName"
              autoComplete="given-name"
              value={values.firstName}
              onChange={set('firstName')}
              placeholder="Maria"
              state={errors.firstName ? 'invalid' : 'default'}
              aria-describedby={errors.firstName ? 'firstName-error' : undefined}
            />
          </Field>

          <Field label="Last name" htmlFor="lastName" required error={errors.lastName}>
            <Input
              id="lastName"
              autoComplete="family-name"
              value={values.lastName}
              onChange={set('lastName')}
              placeholder="Rodriguez"
              state={errors.lastName ? 'invalid' : 'default'}
              aria-describedby={errors.lastName ? 'lastName-error' : undefined}
            />
          </Field>
        </div>

        <Field label="Firm name" htmlFor="firmName" required error={errors.firmName}>
          <Input
            id="firmName"
            autoComplete="organization"
            value={values.firmName}
            onChange={set('firmName')}
            placeholder="Rodriguez & Associates"
            state={errors.firmName ? 'invalid' : 'default'}
            aria-describedby={errors.firmName ? 'firmName-error' : undefined}
          />
        </Field>

        <Field label="Work email" htmlFor="email" required error={errors.email}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={set('email')}
            placeholder="you@yourfirm.com"
            state={errors.email ? 'invalid' : 'default'}
            aria-describedby={errors.email ? 'email-error' : undefined}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="password"
          required
          error={errors.password}
          hint={`At least ${PASSWORD_MIN} characters`}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={values.password}
            onChange={set('password')}
            minLength={PASSWORD_MIN}
            state={errors.password ? 'invalid' : 'default'}
            aria-describedby={errors.password ? 'password-error' : undefined}
          />
        </Field>

        {/* Consent is REQUIRED. Unchecked blocks submit and the reason is
            announced, not just outlined in red. */}
        <div>
          <label
            htmlFor="consent"
            className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-body"
          >
            <input
              id="consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                setErrors((prev) => (prev.consent ? { ...prev, consent: undefined } : prev));
              }}
              required
              aria-invalid={errors.consent ? true : undefined}
              aria-describedby={errors.consent ? 'consent-error' : undefined}
              className={`mt-0.5 h-4 w-4 shrink-0 rounded-[5px] border bg-white/70 accent-primary ${
                errors.consent ? 'border-error' : 'border-glass-hairline'
              }`}
            />
            <span>
              I agree to the{' '}
              <Link href="/terms" className="font-medium text-brand-deep hover:underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link href="/privacy" className="font-medium text-brand-deep hover:underline">
                Privacy Policy
              </Link>
              <span className="ml-0.5 text-error-text" aria-hidden>
                *
              </span>
            </span>
          </label>
          {errors.consent ? (
            <p id="consent-error" role="alert" className="mt-1.5 text-xs font-medium text-error-text">
              {errors.consent}
            </p>
          ) : null}
        </div>

        <Button type="submit" block loading={loading} icon={<ArrowRight size={16} />}>
          {loading ? 'Creating account…' : 'Create Account and Start Trial'}
        </Button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-ink-faint">
        <span className="flex items-center gap-1">
          <Shield size={11} aria-hidden /> SOC 2 Compliant
        </span>
        <span aria-hidden>&middot;</span>
        <span>256-bit encryption</span>
        <span aria-hidden>&middot;</span>
        <span>Cancel anytime</span>
      </div>

      <p className="mt-6 text-center text-sm text-ink-body">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-brand-deep hover:underline">
          Sign in
        </Link>
      </p>
    </GlassCard>
  );
}
