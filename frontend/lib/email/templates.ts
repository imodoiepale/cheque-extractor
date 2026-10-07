/**
 * Kyriq email copy and the one layout every message uses.
 *
 * CHECKLIST section 9. Nineteen templates: six whose triggers already existed,
 * three QuickBooks ones unblocked by the connection-health column in migration
 * 034, and ten trial/usage ones driven off public.tenant_usage_state().
 *
 * Two rules are enforced here rather than left to reviewers:
 *
 *  1. A 'notification' template CANNOT be rendered without an unsubscribe URL.
 *     renderTemplate() throws. The published privacy policy promises an
 *     unsubscribe link, so shipping a usage digest without one is a compliance
 *     exposure, not a cosmetic miss.
 *
 *  2. The meter counts checks that were PROCESSED, never ones that were
 *     uploaded. The email specification says "uploads"; the website, the FAQ
 *     and STRIPE-BILLING-REQUIREMENTS.md all say processed and count only on
 *     success, and the Stripe document is the higher source of truth
 *     (CHECKLIST section 0). The word "upload" therefore does not appear in
 *     any sentence below that states a count — scripts/check-email.ts fails
 *     the build if it comes back. This DIVERGES FROM LOCKED COPY and needs
 *     Michael's sign-off; it is written the authoritative way rather than the
 *     locked way deliberately, because the locked way would contradict the
 *     invoice.
 */

export type EmailCategory = 'transactional' | 'notification';

export interface EmailCta {
  label: string;
  url: string;
}

export interface EmailBody {
  /** Plain sentences. Rendered as <p> and as the text/plain body. */
  paragraphs: string[];
  cta?: EmailCta;
  /** Small print under the CTA, e.g. a link expiry. */
  footnote?: string;
}

export interface EmailTemplate {
  category: EmailCategory;
  /** Which spec email this is, for the log and for tracing back to the docs. */
  spec: string;
  subject: (v: any) => string;
  body: (v: any) => EmailBody;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  category: EmailCategory;
}

export const SENDER = 'Kyriq <notifications@updates.kyriq.com>';
export const REPLY_TO = 'support@kyriq.com';

export function appUrl(path = ''): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://kyriq.com').replace(/\/+$/, '');
  return path ? `${base}${path.startsWith('/') ? path : `/${path}`}` : base;
}

/** The link that lands on pages/api/email/unsubscribe.ts. */
export function unsubscribeUrl(token: string): string {
  return appUrl(`/api/email/unsubscribe?token=${encodeURIComponent(token)}`);
}

/* ────────────────────────────── the templates ──────────────────────────── */

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const firmOf = (v: any) => v.firmName || 'your firm';

export const TEMPLATES = {
  /* ── 1-6: triggers that already existed (team + processing) ─────────── */

  team_invitation: {
    category: 'transactional',
    spec: 'operational-01 invitation sent',
    subject: (v) => `${v.inviterName || 'An administrator'} invited you to ${firmOf(v)} on Kyriq`,
    body: (v) => ({
      paragraphs: [
        `${v.inviterName || 'An administrator'} has invited you to join ${firmOf(v)} on Kyriq as ${v.roleLabel || 'a team member'}.`,
        'Kyriq extracts data from scanned cheques and reconciles it against QuickBooks Online.',
      ],
      cta: { label: 'Accept the invitation', url: v.inviteUrl },
      footnote: v.expiresAt
        ? `This link works once and expires on ${formatDate(v.expiresAt)}.`
        : 'This link works once.',
    }),
  },

  team_invitation_accepted: {
    category: 'transactional',
    spec: 'operational-02 invitation accepted',
    subject: (v) => `${v.memberEmail} joined ${firmOf(v)}`,
    body: (v) => ({
      paragraphs: [
        `${v.memberEmail} accepted your invitation and is now ${v.roleLabel || 'a team member'} of ${firmOf(v)}.`,
      ],
      cta: { label: 'Open team settings', url: appUrl('/settings/team') },
    }),
  },

  team_invitation_expired: {
    category: 'transactional',
    spec: 'operational-03 invitation expired',
    subject: (v) => `Your invitation to ${firmOf(v)} has expired`,
    body: (v) => ({
      paragraphs: [
        `The invitation to join ${firmOf(v)} on Kyriq expired on ${formatDate(v.expiresAt)} and the link no longer works.`,
        'Ask an administrator at the firm to send a new invitation.',
      ],
    }),
  },

  team_member_removed: {
    category: 'transactional',
    spec: 'operational-09 member removed',
    subject: (v) => `Your access to ${firmOf(v)} on Kyriq has been removed`,
    body: (v) => ({
      paragraphs: [
        `An administrator has removed your access to ${firmOf(v)} on Kyriq. You can no longer sign in to that firm's account.`,
        'If you believe this is a mistake, contact an administrator at the firm.',
      ],
    }),
  },

  team_role_changed: {
    category: 'transactional',
    spec: 'operational-10 role changed',
    subject: (v) => `Your role in ${firmOf(v)} is now ${v.newRoleLabel}`,
    body: (v) => ({
      paragraphs: [
        `An administrator changed your role in ${firmOf(v)} from ${v.oldRoleLabel || 'your previous role'} to ${v.newRoleLabel}.`,
        v.newRoleLabel === 'Administrator'
          ? 'Administrators can manage the team, billing and QuickBooks connections.'
          : 'Your access to some settings may have changed.',
      ],
      cta: { label: 'Open Kyriq', url: appUrl('/dashboard') },
    }),
  },

  processing_failed: {
    category: 'transactional',
    spec: 'operational-14 processing failed',
    subject: (v) => `We could not process ${v.documentName || 'your document'}`,
    body: (v) => ({
      paragraphs: [
        `Processing failed for ${v.documentName || 'a document'} in ${firmOf(v)}.`,
        v.errorMessage
          ? `The reason recorded was: ${v.errorMessage}`
          : 'No specific reason was recorded.',
        'Nothing was counted against your allowance for this document. Try again, or reply to this email and we will look at it.',
      ],
      cta: { label: 'Open the document', url: appUrl(`/review/${v.jobId || ''}`) },
    }),
  },

  /* ── 7-9: QuickBooks, unblocked by qb_connections.status (034) ──────── */

  qb_connected: {
    category: 'transactional',
    spec: 'operational-11 QuickBooks connected',
    subject: (v) => `QuickBooks Online is connected to ${firmOf(v)}`,
    body: (v) => ({
      paragraphs: [
        `${v.companyName || 'A QuickBooks company'} is now connected to ${firmOf(v)} on Kyriq.`,
        'Kyriq can now pull cheque transactions from that company for reconciliation.',
      ],
      cta: { label: 'Open reconciliation', url: appUrl('/reconcile') },
    }),
  },

  qb_sync_failed: {
    category: 'transactional',
    spec: 'operational-12 QuickBooks sync failed',
    subject: (v) => `A QuickBooks sync did not complete for ${v.companyName || firmOf(v)}`,
    body: (v) => ({
      paragraphs: [
        `Kyriq could not finish pulling transactions from ${v.companyName || 'your QuickBooks company'}.`,
        v.errorMessage ? `The reason recorded was: ${v.errorMessage}` : 'No specific reason was recorded.',
        'Some transactions may be missing from reconciliation until the next successful sync. Matching figures against a partial sync will be wrong.',
      ],
      cta: { label: 'Check the connection', url: appUrl('/settings/integrations') },
    }),
  },

  qb_disconnected: {
    category: 'transactional',
    spec: 'operational-13 QuickBooks needs reconnecting',
    subject: (v) => `Reconnect QuickBooks for ${v.companyName || firmOf(v)}`,
    body: (v) => ({
      paragraphs: [
        `Kyriq has lost its authorisation for ${v.companyName || 'your QuickBooks company'} and can no longer read transactions from it.`,
        v.statusDetail ? `What QuickBooks reported: ${v.statusDetail}` : 'QuickBooks declined the stored authorisation.',
        'Reconnecting takes about a minute and only an administrator can do it. Reconciliation will show stale figures until it is done.',
      ],
      cta: { label: 'Reconnect QuickBooks', url: appUrl('/settings/integrations') },
    }),
  },

  /* ── 10-19: trial and usage, driven off tenant_usage_state() ─────────
   *
   * Every number in these comes from the same resolver the server-side
   * processing gate uses, so the email and the gate cannot disagree about
   * whether a firm is blocked. "Processed", never "uploaded" — see the header.
   */

  trial_started: {
    category: 'transactional',
    spec: 'billing-01 trial started',
    subject: () => 'Your Kyriq trial has started',
    body: (v) => ({
      paragraphs: [
        `${firmOf(v)} is on a Kyriq trial: ${v.trialDays || 14} days or ${v.trialCheckLimit || 250} processed checks, whichever comes first. No card is needed.`,
        'A check counts once it has been processed successfully. Pages we find no check on are not counted, and a document that fails to process is not counted.',
      ],
      cta: { label: 'Add your first document', url: appUrl('/upload') },
    }),
  },

  trial_halfway: {
    category: 'notification',
    spec: 'billing-02 trial halfway',
    subject: (v) => `You have processed ${v.checksUsed} of your ${v.checkLimit} trial checks`,
    body: (v) => ({
      paragraphs: [
        `${firmOf(v)} has processed ${v.checksUsed} ${plural(v.checksUsed, 'check', 'checks')} of the ${v.checkLimit} included in the trial, with ${v.daysRemaining} ${plural(v.daysRemaining, 'day', 'days')} left.`,
        'Nothing changes yet. This is a heads-up so the end of the trial is not a surprise.',
      ],
      cta: { label: 'See plans', url: appUrl('/billing') },
    }),
  },

  trial_checks_warning: {
    category: 'notification',
    spec: 'billing-03 trial allowance nearly used',
    subject: (v) => `${v.checksRemaining} trial checks left`,
    body: (v) => ({
      paragraphs: [
        `${firmOf(v)} has processed ${v.checksUsed} of ${v.checkLimit} trial checks. ${v.checksRemaining} ${plural(v.checksRemaining, 'remains', 'remain')}.`,
        'When the trial allowance is used, processing stops until a plan is chosen. Your existing data and history stay available either way.',
      ],
      cta: { label: 'Choose a plan', url: appUrl('/billing') },
    }),
  },

  trial_ending_soon: {
    category: 'notification',
    spec: 'billing-04 trial ending soon',
    subject: (v) => `Your Kyriq trial ends in ${v.daysRemaining} ${plural(v.daysRemaining, 'day', 'days')}`,
    body: (v) => ({
      paragraphs: [
        `The trial for ${firmOf(v)} ends on ${formatDate(v.trialEndsAt)}. You have processed ${v.checksUsed} of ${v.checkLimit} included checks.`,
        'Choosing a plan before then keeps processing uninterrupted. Your history stays available whether you do or not.',
      ],
      cta: { label: 'Choose a plan', url: appUrl('/billing') },
    }),
  },

  trial_checks_exhausted: {
    category: 'transactional',
    spec: 'billing-05 trial allowance used',
    subject: () => 'Your trial checks are used — choose a plan to continue',
    body: (v) => ({
      paragraphs: [
        `${firmOf(v)} has processed all ${v.checkLimit} checks included in the trial, so processing has stopped.`,
        'Everything already extracted stays available, and reconciliation and exports still work. Choosing a plan restarts processing immediately.',
      ],
      cta: { label: 'Choose a plan', url: appUrl('/billing') },
    }),
  },

  trial_expired: {
    category: 'transactional',
    spec: 'billing-06 trial ended',
    subject: () => 'Your Kyriq trial has ended',
    body: (v) => ({
      paragraphs: [
        `The trial for ${firmOf(v)} ended on ${formatDate(v.trialEndsAt)}, so processing has stopped. You processed ${v.checksUsed} ${plural(v.checksUsed, 'check', 'checks')}.`,
        'Your data, matches and history are untouched and still readable. Choosing a plan restarts processing immediately.',
      ],
      cta: { label: 'Choose a plan', url: appUrl('/billing') },
    }),
  },

  usage_half: {
    category: 'notification',
    spec: 'billing-08 half the monthly allowance used',
    subject: (v) => `${v.checksUsed} of ${v.allowance} checks processed this month`,
    body: (v) => ({
      paragraphs: [
        `${firmOf(v)} has processed ${v.checksUsed} of the ${v.allowance} checks included in the ${v.planLabel || 'current'} plan this billing period, which ends on ${formatDate(v.periodEnd)}.`,
        'Processing never stops on a paid plan. Checks beyond the included allowance are billed as overage.',
      ],
      cta: { label: 'See usage', url: appUrl('/billing') },
    }),
  },

  usage_warning: {
    category: 'notification',
    spec: 'billing-09 monthly allowance nearly used',
    subject: (v) => `${v.checksRemaining} included checks left this month`,
    body: (v) => ({
      paragraphs: [
        `${firmOf(v)} has processed ${v.checksUsed} of ${v.allowance} included checks this billing period, which ends on ${formatDate(v.periodEnd)}.`,
        'Processing will not stop. Each check processed beyond the allowance is billed as overage on your next invoice.',
      ],
      cta: { label: 'See usage', url: appUrl('/billing') },
    }),
  },

  usage_allowance_reached: {
    category: 'transactional',
    spec: 'billing-10 allowance reached, overage begins',
    subject: () => 'Your included checks are used — overage has started',
    body: (v) => ({
      paragraphs: [
        `${firmOf(v)} has processed all ${v.allowance} checks included in the ${v.planLabel || 'current'} plan for the period ending ${formatDate(v.periodEnd)}.`,
        'Processing continues uninterrupted. Every further check processed in this period is billed as overage on your next invoice.',
        'Moving to a larger plan is usually cheaper than sustained overage.',
      ],
      cta: { label: 'Review your plan', url: appUrl('/billing') },
    }),
  },

  overage_summary: {
    category: 'notification',
    spec: 'billing-11 overage accruing this period',
    subject: (v) => `${v.overageChecks} checks over your allowance so far`,
    body: (v) => ({
      paragraphs: [
        `${firmOf(v)} has processed ${v.checksUsed} checks this billing period, ${v.overageChecks} more than the ${v.allowance} included in the ${v.planLabel || 'current'} plan.`,
        `Those ${v.overageChecks} will appear as overage on the invoice for the period ending ${formatDate(v.periodEnd)}.`,
      ],
      cta: { label: 'See usage', url: appUrl('/billing') },
    }),
  },
} satisfies Record<string, EmailTemplate>;

export type TemplateKey = keyof typeof TEMPLATES;

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];

export function categoryOf(key: TemplateKey): EmailCategory {
  return TEMPLATES[key].category;
}

export function isTransactional(key: TemplateKey): boolean {
  return TEMPLATES[key].category === 'transactional';
}

/* ──────────────────────────────── layout ───────────────────────────────── */

function formatDate(value: unknown): string {
  if (!value) return 'an unrecorded date';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const escapeHtml = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export class EmailRenderError extends Error {}

/**
 * Render one template.
 *
 * Throws EmailRenderError when a 'notification' template is rendered without
 * an unsubscribe URL. That is the enforcement point for the privacy policy's
 * promise, and it is a throw rather than a warning because a warning in a cron
 * job is a thing nobody reads.
 */
export function renderTemplate(
  key: TemplateKey,
  vars: Record<string, any>,
  opts: { unsubscribeUrl?: string | null } = {}
): RenderedEmail {
  const template: EmailTemplate = TEMPLATES[key];
  if (!template) throw new EmailRenderError(`Unknown email template: ${key}`);

  const unsub = opts.unsubscribeUrl || null;
  if (template.category === 'notification' && !unsub) {
    throw new EmailRenderError(
      `Template "${key}" is non-transactional and cannot be sent without an unsubscribe link. ` +
        'The published privacy policy promises one.'
    );
  }

  const subject = template.subject(vars);
  const body = template.body(vars);
  const paragraphs = body.paragraphs.filter(Boolean);

  const textParts = [...paragraphs];
  if (body.cta) textParts.push(`${body.cta.label}: ${body.cta.url}`);
  if (body.footnote) textParts.push(body.footnote);
  textParts.push(`Questions? Reply to this email or write to ${REPLY_TO}.`);
  if (unsub) textParts.push(`Stop receiving these updates: ${unsub}`);

  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#17212e;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:14px;padding:32px;">
<tr><td style="font-size:18px;font-weight:600;letter-spacing:-0.01em;padding-bottom:18px;">Kyriq</td></tr>
<tr><td style="font-size:20px;font-weight:600;line-height:1.3;padding-bottom:16px;">${escapeHtml(subject)}</td></tr>
${paragraphs
  .map(
    (p) =>
      `<tr><td style="font-size:15px;line-height:1.6;padding-bottom:14px;">${escapeHtml(p)}</td></tr>`
  )
  .join('\n')}
${
  body.cta
    ? `<tr><td style="padding:10px 0 6px;"><a href="${escapeHtml(body.cta.url)}" style="display:inline-block;background:#17212e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:10px;">${escapeHtml(body.cta.label)}</a></td></tr>`
    : ''
}
${
  body.footnote
    ? `<tr><td style="font-size:13px;line-height:1.5;color:#5b6775;padding-top:10px;">${escapeHtml(body.footnote)}</td></tr>`
    : ''
}
<tr><td style="font-size:13px;line-height:1.5;color:#5b6775;padding-top:22px;border-top:1px solid #e6eaef;">
Questions? Reply to this email or write to <a href="mailto:${REPLY_TO}" style="color:#17212e;">${REPLY_TO}</a>.
${
  unsub
    ? `<br><a href="${escapeHtml(unsub)}" style="color:#5b6775;">Stop receiving these updates</a>`
    : '<br>You are receiving this because it concerns your Kyriq account.'
}
</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, html, text: textParts.join('\n\n'), category: template.category };
}
