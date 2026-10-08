/**
 * The mail transport. One module, `fetch`-based, no dependency.
 *
 * ponytail: the `resend` npm package wraps one authenticated POST to
 * https://api.resend.com/emails, and this repo's rule is no new dependency if
 * it can be avoided — the same reasoning as lib/billing/stripe.ts, which wraps
 * Stripe with fetch and node:crypto. Named ceiling: no batch endpoint, no
 * attachments, no webhook ingestion for bounces and complaints. A bounce is
 * therefore invisible to us today; when that matters, add the Resend webhook
 * and write it back to email_log, which already has a row per send.
 *
 * Three properties this module is responsible for:
 *
 *  1. HONEST WHEN UNCONFIGURED. There is no RESEND_API_KEY in this repo's
 *     environment and no email has ever been delivered by this code. With no
 *     key, sendEmail() does not call fetch, returns status
 *     'skipped_unconfigured', and records that row. It never reports a send it
 *     did not make.
 *
 *  2. SEND-ONCE IS A DATABASE CONSTRAINT. sendOnce() claims a row in
 *     public.billing_notices, whose UNIQUE (tenant_id, kind, period_key) from
 *     migration 033 is the guarantee. A retried cron loses the insert with
 *     23505 and returns 'already_sent' without sending. There is deliberately
 *     no `select ... where kind = ?` pre-check anywhere in this file: that
 *     would pass review and lose a race, exactly as a webhook "have I seen
 *     this event?" check would.
 *
 *  3. NON-TRANSACTIONAL MAIL CARRIES AN UNSUBSCRIBE LINK AND HONOURS IT.
 *     Category comes from the template, not from the caller. A 'notification'
 *     template resolves (and creates, once) the recipient's email_preferences
 *     row, suppresses the send when unsubscribed_at is set, and renders the
 *     unsubscribe URL; renderTemplate() throws if it somehow has none.
 *     Transactional mail — an invitation, a role change, "processing stopped" —
 *     is not subject to unsubscribe and does not consult it.
 *
 * Every attempt writes one email_log row, so a missing email is diagnosable
 * from the database rather than from whether anyone kept the server logs.
 */
import { createServiceClient } from '@/lib/supabase/api';
import {
  REPLY_TO,
  SENDER,
  TEMPLATES,
  renderTemplate,
  unsubscribeUrl,
  type EmailCategory,
  type TemplateKey,
} from './templates';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type SendStatus =
  | 'sent'
  | 'failed'
  | 'skipped_unconfigured'
  | 'suppressed'
  | 'already_sent';

export interface EmailConfig {
  configured: boolean;
  apiKey: string | null;
  from: string;
  replyTo: string;
  missing: string[];
  /** Human-readable reason the transport is unusable, or null. */
  reason: string | null;
}

/**
 * Resend keys are `re_...`. A key that is not shaped like one is treated as
 * absent rather than tried, so a placeholder left in .env fails loudly at
 * startup-shaped code instead of producing a 401 per send.
 */
export function emailConfig(
  source: Record<string, string | undefined> = process.env as any
): EmailConfig {
  const apiKey = (source.RESEND_API_KEY || '').trim() || null;
  const from = (source.EMAIL_FROM || '').trim() || SENDER;
  const replyTo = (source.EMAIL_REPLY_TO || '').trim() || REPLY_TO;

  if (!apiKey) {
    return {
      configured: false,
      apiKey: null,
      from,
      replyTo,
      missing: ['RESEND_API_KEY'],
      reason: 'RESEND_API_KEY is not set, so no email is sent.',
    };
  }
  if (!/^re_[A-Za-z0-9_-]{8,}$/.test(apiKey)) {
    return {
      configured: false,
      apiKey,
      from,
      replyTo,
      missing: ['RESEND_API_KEY'],
      reason: 'RESEND_API_KEY is not a recognisable re_ key. Refusing to send with it.',
    };
  }

  return { configured: true, apiKey, from, replyTo, missing: [], reason: null };
}

export interface SendResult {
  sent: boolean;
  status: SendStatus;
  template: TemplateKey;
  to: string;
  subject: string | null;
  category: EmailCategory;
  providerId: string | null;
  reason: string | null;
}

export interface SendEmailArgs {
  to: string;
  template: TemplateKey;
  vars?: Record<string, any>;
  /** Owning firm. Required for a 'notification' template: unsubscribe is per firm. */
  tenantId?: string | null;
  /** Extra context recorded on the email_log row. */
  metadata?: Record<string, any>;
  config?: EmailConfig;
  /** Injected in tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /**
   * Injected in tests. Defaults to the service client. Production callers
   * never pass this; scripts/check-email.ts drives the send-once and
   * suppression paths with it, because the alternative is asserting on source
   * text and hoping it means what it says.
   */
  db?: any;
}

/* ───────────────────────────── preferences ─────────────────────────────── */

export interface RecipientPreference {
  unsubscribed: boolean;
  token: string | null;
  /** True when email_preferences is not in the database yet (034 unapplied). */
  unavailable: boolean;
}

/**
 * Read — and on first contact create — the recipient's preference row, for the
 * token the unsubscribe link needs. Only called for non-transactional mail.
 *
 * A missing table (migration 034 unapplied) returns unavailable, and the
 * caller then REFUSES to send rather than sending without a working
 * unsubscribe link. Failing closed is the only safe direction here: the
 * promise in the privacy policy is not conditional on our deploy order.
 */
export async function recipientPreference(
  tenantId: string,
  email: string,
  db?: any
): Promise<RecipientPreference> {
  const svc = db ?? createServiceClient();
  const to = email.trim().toLowerCase();

  const { data, error } = await svc
    .from('email_preferences')
    .select('token, unsubscribed_at')
    .eq('tenant_id', tenantId)
    .eq('email', to)
    .maybeSingle();

  if (error) return { unsubscribed: false, token: null, unavailable: true };
  if (data?.token) {
    return { unsubscribed: Boolean(data.unsubscribed_at), token: data.token, unavailable: false };
  }

  // First non-transactional email to this address: create the row so there is
  // a token to put in the footer. The default token is generated by the
  // database (gen_random_bytes), not here.
  const { data: created, error: insertError } = await svc
    .from('email_preferences')
    .insert({ tenant_id: tenantId, email: to, source: 'first_notification' })
    .select('token, unsubscribed_at')
    .maybeSingle();

  if (insertError || !created?.token) {
    // Lost a race with a concurrent send, most likely. Re-read.
    const { data: again } = await svc
      .from('email_preferences')
      .select('token, unsubscribed_at')
      .eq('tenant_id', tenantId)
      .eq('email', to)
      .maybeSingle();
    if (again?.token) {
      return { unsubscribed: Boolean(again.unsubscribed_at), token: again.token, unavailable: false };
    }
    return { unsubscribed: false, token: null, unavailable: true };
  }

  return { unsubscribed: Boolean(created.unsubscribed_at), token: created.token, unavailable: false };
}

/* ────────────────────────────── the log ────────────────────────────────── */

/**
 * Best-effort, like auditLog(): a failed log write must not fail the send, but
 * it is logged loudly, because the whole point of the table is that a missing
 * email can be explained afterwards.
 */
async function logAttempt(row: {
  tenantId?: string | null;
  to: string;
  template: string;
  subject: string;
  status: SendStatus;
  category: EmailCategory;
  providerId?: string | null;
  error?: string | null;
  metadata?: Record<string, any>;
  db?: any;
}) {
  try {
    const client = row.db ?? createServiceClient();
    const { error } = await client.from('email_log').insert({
      tenant_id: row.tenantId ?? null,
      to_email: row.to,
      template: row.template,
      subject: row.subject,
      status: row.status,
      category: row.category,
      provider_id: row.providerId ?? null,
      error: row.error ?? null,
      metadata: row.metadata ?? {},
    });
    if (error) console.error('[email_log] insert failed:', error.message);
  } catch (err: any) {
    console.error('[email_log] insert threw:', err?.message);
  }
}

/* ───────────────────────────── the transport ───────────────────────────── */

/**
 * Send one email.
 *
 * Returns rather than throws: a cron that mails twelve firms must not stop at
 * the first bad address, and every outcome is already recorded.
 */
export async function sendEmail(args: SendEmailArgs): Promise<SendResult> {
  const { to, template, vars = {}, tenantId = null, metadata = {} } = args;
  const spec = TEMPLATES[template];
  const category: EmailCategory = spec?.category ?? 'transactional';

  const base = {
    sent: false,
    status: 'failed' as SendStatus,
    template,
    to,
    subject: null as string | null,
    category,
    providerId: null as string | null,
    reason: null as string | null,
  };

  if (!spec) {
    return { ...base, reason: `Unknown email template: ${template}` };
  }
  if (!to || !/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(to)) {
    return { ...base, reason: `Not a usable recipient address: ${to || '(empty)'}` };
  }

  // ── Unsubscribe, for non-transactional mail only ─────────────────────
  let unsubUrl: string | null = null;
  if (category === 'notification') {
    if (!tenantId) {
      return { ...base, reason: `Template ${template} is non-transactional and needs a tenantId.` };
    }
    const pref = await recipientPreference(tenantId, to, args.db);
    if (pref.unavailable || !pref.token) {
      const reason =
        'Cannot resolve an unsubscribe token (apply supabase/migrations/034_email_and_qb_health.sql). ' +
        'Refusing to send non-transactional email without a working unsubscribe link.';
      await logAttempt({
        tenantId,
        to,
        template,
        subject: `(not rendered) ${template}`,
        status: 'failed',
        category,
        error: reason,
        metadata,
        db: args.db,
      });
      return { ...base, reason };
    }
    if (pref.unsubscribed) {
      await logAttempt({
        tenantId,
        to,
        template,
        subject: `(suppressed) ${template}`,
        status: 'suppressed',
        category,
        metadata,
        db: args.db,
      });
      return { ...base, status: 'suppressed', reason: 'Recipient has unsubscribed.' };
    }
    unsubUrl = unsubscribeUrl(pref.token);
  }

  let rendered;
  try {
    rendered = renderTemplate(template, vars, { unsubscribeUrl: unsubUrl });
  } catch (err: any) {
    const reason = err?.message || 'Render failed';
    await logAttempt({
      tenantId,
      to,
      template,
      subject: `(render failed) ${template}`,
      status: 'failed',
      category,
      error: reason,
      metadata,
      db: args.db,
    });
    return { ...base, reason };
  }

  // ── Unconfigured: record what we would have sent, send nothing ───────
  const cfg = args.config ?? emailConfig();
  if (!cfg.configured || !cfg.apiKey) {
    await logAttempt({
      tenantId,
      to,
      template,
      subject: rendered.subject,
      status: 'skipped_unconfigured',
      category,
      error: cfg.reason,
      metadata: { ...metadata, missing: cfg.missing },
      db: args.db,
    });
    return {
      ...base,
      status: 'skipped_unconfigured',
      subject: rendered.subject,
      reason: cfg.reason,
    };
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.apiKey}`,
    'Content-Type': 'application/json',
  };

  const payload: Record<string, any> = {
    from: cfg.from,
    to: [to],
    reply_to: cfg.replyTo,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  };

  // RFC 8058 one-click unsubscribe. Only ever on non-transactional mail:
  // putting it on a password reset teaches mail clients to offer an opt-out
  // from messages the account cannot function without.
  if (unsubUrl) {
    payload.headers = {
      'List-Unsubscribe': `<${unsubUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    };
  }

  const doFetch = args.fetchImpl ?? fetch;

  try {
    const res = await doFetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* Resend always sends JSON; a non-JSON body means a proxy or an outage. */
    }

    if (!res.ok) {
      const reason = json?.message || json?.error?.message || `Resend returned ${res.status}`;
      await logAttempt({
        tenantId,
        to,
        template,
        subject: rendered.subject,
        status: 'failed',
        category,
        error: reason,
        metadata: { ...metadata, http_status: res.status },
        db: args.db,
      });
      return { ...base, subject: rendered.subject, reason };
    }

    // A 200 is not proof of success: assert on the parsed shape.
    const providerId = typeof json?.id === 'string' ? json.id : null;
    if (!providerId) {
      const reason = 'Resend accepted the request but returned no message id.';
      await logAttempt({
        tenantId,
        to,
        template,
        subject: rendered.subject,
        status: 'failed',
        category,
        error: reason,
        metadata: { ...metadata, body: text.slice(0, 500) },
        db: args.db,
      });
      return { ...base, subject: rendered.subject, reason };
    }

    await logAttempt({
      tenantId,
      to,
      template,
      subject: rendered.subject,
      status: 'sent',
      category,
      providerId,
      metadata,
      db: args.db,
    });
    return {
      ...base,
      sent: true,
      status: 'sent',
      subject: rendered.subject,
      providerId,
    };
  } catch (err: any) {
    const reason = err?.message || 'Network error contacting Resend';
    await logAttempt({
      tenantId,
      to,
      template,
      subject: rendered.subject,
      status: 'failed',
      category,
      error: reason,
      metadata,
      db: args.db,
    });
    return { ...base, subject: rendered.subject, reason };
  }
}

/* ───────────────────────────── send-once ───────────────────────────────── */

export interface SendOnceArgs extends SendEmailArgs {
  tenantId: string;
  /**
   * The send-once key. `kind` identifies the notice, `periodKey` says what it
   * is ABOUT — an invitation id, a renewal date, a billing period start — so
   * the constraint means "once per that thing", not "once ever".
   */
  kind: string;
  periodKey: string;
}

/**
 * Send an email at most once per (tenant, kind, periodKey).
 *
 * The claim row goes in BEFORE the send, so two concurrent crons cannot both
 * pass a check and both mail. The loser gets 23505 from
 * billing_notices_once and returns 'already_sent'.
 *
 * ponytail: if the send then fails we DELETE the claim so a retry can happen,
 * but a process that dies between the provider accepting and that update
 * leaves a claim with no recorded provider id. Named ceiling: the email is
 * never re-sent in that case, which is the safe direction for a notice that
 * must not repeat. Upgrade path, if it ever matters: a two-phase claim with a
 * 'claimed_at'/'confirmed_at' pair and a sweeper, which is a migration to
 * billing_notices and not a change here.
 */
export async function sendOnce(args: SendOnceArgs): Promise<SendResult & { claimed: boolean }> {
  const { tenantId, kind, periodKey, ...rest } = args;
  const svc = args.db ?? createServiceClient();
  const category: EmailCategory = TEMPLATES[args.template]?.category ?? 'transactional';

  const { error: claimError } = await svc.from('billing_notices').insert({
    tenant_id: tenantId,
    kind,
    period_key: periodKey,
    channel: 'email',
    metadata: {
      template: args.template,
      to: args.to,
      category,
      ...(args.metadata ?? {}),
    },
  });

  if (claimError) {
    if (claimError.code === '23505' || /duplicate key/i.test(claimError.message || '')) {
      return {
        sent: false,
        status: 'already_sent',
        template: args.template,
        to: args.to,
        subject: null,
        category,
        providerId: null,
        reason: `billing_notices already holds ${kind}/${periodKey} for this firm.`,
        claimed: false,
      };
    }
    return {
      sent: false,
      status: 'failed',
      template: args.template,
      to: args.to,
      subject: null,
      category,
      providerId: null,
      reason: `Could not claim send-once row: ${claimError.message}`,
      claimed: false,
    };
  }

  const result = await sendEmail({ ...rest, tenantId, metadata: { ...(args.metadata ?? {}), kind, periodKey } });

  if (result.sent) {
    await svc
      .from('billing_notices')
      .update({
        metadata: {
          template: args.template,
          to: args.to,
          category,
          provider_id: result.providerId,
          ...(args.metadata ?? {}),
        },
      })
      .eq('tenant_id', tenantId)
      .eq('kind', kind)
      .eq('period_key', periodKey);
    return { ...result, claimed: true };
  }

  if (result.status === 'suppressed') {
    // The recipient opted out. The claim stays: the notice is settled for this
    // period and a later run must not try again.
    return { ...result, claimed: true };
  }

  // Nothing was delivered. Release the claim so a retry is possible, including
  // the 'skipped_unconfigured' case — once a Resend key exists, the next run
  // of the cron sends this notice for real.
  await svc
    .from('billing_notices')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('kind', kind)
    .eq('period_key', periodKey);

  return { ...result, claimed: false };
}

/** Administrator addresses for a firm — who QuickBooks and usage notices go to. */
export async function adminRecipients(tenantId: string): Promise<string[]> {
  const { data, error } = await createServiceClient()
    .from('user_profiles')
    .select('email, role')
    .eq('tenant_id', tenantId)
    .eq('role', 'admin');
  if (error) {
    console.error('[email] could not read administrators:', error.message);
    return [];
  }
  return (data || [])
    .map((r: any) => String(r.email || '').trim().toLowerCase())
    .filter(Boolean);
}
