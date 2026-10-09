/**
 * Writes Supabase Auth's email templates (signup confirmation, password reset,
 * magic link, invite, email change) from the same shell as every Resend email,
 * so the first email a firm ever gets looks like Kyriq, not Supabase.
 *
 *   npx tsx scripts/build-auth-emails.ts
 *
 * Output: supabase/templates/*.html, referenced from supabase/config.toml for
 * local auth. For the hosted project, paste each file into Dashboard -> Auth ->
 * Email Templates (subjects are printed below), and set Auth -> SMTP to Resend
 * (smtp.resend.com:465, user "resend", password = RESEND_API_KEY, sender
 * notifications@updates.kyriq.com) so these send from Kyriq's domain.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emailShell } from '../lib/email/layout';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../supabase/templates');

// Supabase Go-template placeholders, emitted verbatim (rawUrls).
const LINK = '{{ .ConfirmationURL }}';

const TEMPLATES: Record<string, { subject: string; eyebrow: string; heading: string; preheader: string; paragraphs: string[]; cta: string; footnote: string }> = {
  confirmation: {
    subject: 'Confirm your email to start your Kyriq trial',
    eyebrow: 'Welcome to Kyriq',
    heading: 'Confirm your email',
    preheader: 'One click and your 14-day trial is ready.',
    paragraphs: [
      'Thanks for signing up. Confirm this address and your 14-day trial starts: up to 250 processed checks, unlimited companies and users, and the Chrome extension included.',
      'Next step after this: connect QuickBooks Online and upload the bank statement you already download.',
    ],
    cta: 'Confirm email',
    footnote: 'If you did not create a Kyriq account, you can ignore this email.',
  },
  recovery: {
    subject: 'Reset your Kyriq password',
    eyebrow: 'Security',
    heading: 'Reset your password',
    preheader: 'Use this link to choose a new password.',
    paragraphs: ['We received a request to reset the password for your Kyriq account. This link works once and expires soon.'],
    cta: 'Choose a new password',
    footnote: 'If you did not ask for this, ignore this email. Your password stays the same.',
  },
  magic_link: {
    subject: 'Your Kyriq sign-in link',
    eyebrow: 'Sign in',
    heading: 'Sign in to Kyriq',
    preheader: 'Your one-time sign-in link.',
    paragraphs: ['Use the button below to sign in. The link works once and expires soon.'],
    cta: 'Sign in',
    footnote: 'If you did not try to sign in, you can ignore this email.',
  },
  invite: {
    subject: 'You have been invited to Kyriq',
    eyebrow: 'Team invite',
    heading: 'Join your team on Kyriq',
    preheader: 'Your firm reconciles checks in Kyriq. Accept to join.',
    paragraphs: [
      'You have been invited to a firm on Kyriq, the check reconciliation workspace for QuickBooks Online.',
      'Accept the invite to set your password and see your team’s companies and reconciliations.',
    ],
    cta: 'Accept invite',
    footnote: 'Not expecting this? You can ignore it and no account will be created.',
  },
  email_change: {
    subject: 'Confirm your new Kyriq email address',
    eyebrow: 'Security',
    heading: 'Confirm your new email',
    preheader: 'Confirm the change to your Kyriq sign-in email.',
    paragraphs: ['Confirm this address to finish changing the email you use to sign in to Kyriq.'],
    cta: 'Confirm new email',
    footnote: 'If you did not request this change, contact support@kyriq.com right away.',
  },
};

mkdirSync(out, { recursive: true });
for (const [key, t] of Object.entries(TEMPLATES)) {
  const html = emailShell({
    heading: t.heading,
    eyebrow: t.eyebrow,
    preheader: t.preheader,
    paragraphs: t.paragraphs,
    cta: { label: t.cta, url: LINK },
    footnote: t.footnote,
    rawUrls: true,
  });
  writeFileSync(path.join(out, `${key}.html`), html);
  console.log(`${key.padEnd(13)} subject: ${t.subject}`);
}
console.log(`\nwrote ${Object.keys(TEMPLATES).length} templates to ${out}`);
