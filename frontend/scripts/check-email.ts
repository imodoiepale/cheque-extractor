/**
 * Self-check for email (CHECKLIST section 9).
 *
 *   cd frontend && npx tsx scripts/check-email.ts
 *
 * No test framework, by the same reasoning as scripts/check-stripe-billing.ts.
 * There is NO RESEND_API_KEY in this environment and not one email has ever
 * been delivered by this code, so nothing here proves deliverability. What it
 * proves is that the failures which would ship unnoticed cannot:
 *
 *  1. An email "sends" while the transport is unconfigured. Tested
 *     BEHAVIOURALLY with a fetch spy: the spy must never be called, and the
 *     status must say so.
 *  2. Send-once degrades into an application check. The guarantee is
 *     billing_notices' UNIQUE (tenant_id, kind, period_key); a
 *     `select ... where kind = ?` pre-check would pass review and lose a race.
 *     Tested behaviourally against a fake client that answers 23505, and by
 *     source scan for the pre-check shape.
 *  3. A non-transactional email ships without an unsubscribe link. Every
 *     template is rendered; renderTemplate must THROW for a notification one
 *     with no link, and the suppression path must actually suppress.
 *  4. The word "uploads" comes back in copy that counts processed checks. The
 *     billing document is authoritative and counts on success; an email saying
 *     "uploads" would contradict the invoice.
 *  5. A QB status write is dropped from either wired refresh path, or a
 *     transient failure starts emailing firms "reconnect QuickBooks".
 *
 * Source-reading checks run against COMMENT-STRIPPED source, because these
 * files deliberately describe what must not happen and a check satisfied by its
 * own documentation is not a check.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  TEMPLATES,
  TEMPLATE_KEYS,
  renderTemplate,
  unsubscribeUrl,
  EmailRenderError,
  type TemplateKey,
} from '../lib/email/templates';
import { emailConfig, sendEmail, sendOnce } from '../lib/email/send';
import { classifyRefreshFailure, warrantsReconnectEmail } from '../lib/qb-health';
import { decideNotices } from '../pages/api/email/notices';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');
const readRepo = (rel: string) => readFileSync(path.join(repo, rel), 'utf8');

/** Source with comments removed. See the header. */
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');

const code = (rel: string) => strip(read(rel));
const sql = (rel: string) => readRepo(rel).replace(/^\s*--[^\n]*$/gm, '');

const MIGRATION = 'supabase/migrations/034_email_and_qb_health.sql';
const SEND = 'lib/email/send.ts';
const TEMPLATES_FILE = 'lib/email/templates.ts';
const QB_HEALTH = 'lib/qb-health.ts';
const MATCH_HELPERS = 'lib/match-helpers.ts';
const PULL_CHECKS = 'pages/api/qbo/pull-checks.ts';
const QB_TOKEN = 'lib/qb-token.ts';
const INVITE = 'pages/api/team/invite.ts';
const MEMBER = 'pages/api/team/members/[id].ts';
const ACCEPT = 'pages/api/team/invitations/[token]/accept.ts';
const HEALTH_CHECK = 'pages/api/qbo/health-check.ts';
const NOTICES = 'pages/api/email/notices.ts';
const UNSUBSCRIBE = 'pages/api/email/unsubscribe.ts';

const results: string[] = [];
const ok = (what: string) => results.push(`  ok   ${what}`);

/* ═══ 0. The comment stripper itself ═══════════════════════════════════════
 *
 * Three assertions in this session passed vacuously, one of them satisfied by
 * its own doc comment. If strip() silently stopped stripping, every source
 * check below would start passing for the wrong reason, so it is checked
 * first.
 */
{
  const sample = '/* banned_token */\nconst a = 1; // banned_token\nconst b = "kept";';
  assert.ok(!strip(sample).includes('banned_token'), 'strip() must remove block and line comments');
  assert.ok(strip(sample).includes('"kept"'), 'strip() must keep code');
  // And it must actually be stripping THIS repo's files, not returning them whole.
  assert.ok(
    code(SEND).length < read(SEND).length * 0.75,
    'send.ts is heavily commented; a stripped copy barely smaller than the original means strip() is not working'
  );
  ok('strip() removes comments, and is removing them from this repo');
}

/* ═══ 1. Sample variables, and every template renders ══════════════════════ */

const SAMPLES: Record<TemplateKey, Record<string, any>> = {
  team_invitation: {
    firmName: 'Harrow & Finch',
    inviterName: 'admin@harrowfinch.com',
    roleLabel: 'Administrator',
    inviteUrl: 'https://kyriq.com/invite/abc',
    expiresAt: '2026-10-13T00:00:00Z',
  },
  team_invitation_accepted: {
    firmName: 'Harrow & Finch',
    memberEmail: 'new@harrowfinch.com',
    roleLabel: 'User',
  },
  team_invitation_expired: { firmName: 'Harrow & Finch', expiresAt: '2026-10-01T00:00:00Z' },
  team_member_removed: { firmName: 'Harrow & Finch' },
  team_role_changed: { firmName: 'Harrow & Finch', oldRoleLabel: 'User', newRoleLabel: 'Administrator' },
  processing_failed: {
    firmName: 'Harrow & Finch',
    documentName: 'march-statement.pdf',
    errorMessage: 'Poppler could not rasterise page 4',
    jobId: 'job-1',
  },
  qb_connected: { firmName: 'Harrow & Finch', companyName: 'Harrow Finch LLP' },
  qb_sync_failed: { companyName: 'Harrow Finch LLP', errorMessage: 'QueryValidationError' },
  qb_disconnected: { companyName: 'Harrow Finch LLP', statusDetail: 'invalid_grant' },
  trial_started: { firmName: 'Harrow & Finch', trialDays: 14, trialCheckLimit: 250 },
  trial_halfway: { firmName: 'Harrow & Finch', checksUsed: 125, checkLimit: 250, daysRemaining: 7 },
  trial_checks_warning: {
    firmName: 'Harrow & Finch',
    checksUsed: 200,
    checkLimit: 250,
    checksRemaining: 50,
  },
  trial_ending_soon: {
    firmName: 'Harrow & Finch',
    daysRemaining: 3,
    trialEndsAt: '2026-10-09T00:00:00Z',
    checksUsed: 90,
    checkLimit: 250,
  },
  trial_checks_exhausted: { firmName: 'Harrow & Finch', checkLimit: 250 },
  trial_expired: { firmName: 'Harrow & Finch', trialEndsAt: '2026-10-05T00:00:00Z', checksUsed: 180 },
  usage_half: {
    firmName: 'Harrow & Finch',
    checksUsed: 500,
    allowance: 1000,
    planLabel: 'Growth',
    periodEnd: '2026-10-31',
  },
  usage_warning: {
    firmName: 'Harrow & Finch',
    checksUsed: 800,
    allowance: 1000,
    checksRemaining: 200,
    periodEnd: '2026-10-31',
  },
  usage_allowance_reached: {
    firmName: 'Harrow & Finch',
    allowance: 1000,
    planLabel: 'Growth',
    periodEnd: '2026-10-31',
  },
  overage_summary: {
    firmName: 'Harrow & Finch',
    checksUsed: 1120,
    allowance: 1000,
    overageChecks: 120,
    planLabel: 'Growth',
    periodEnd: '2026-10-31',
  },
};

{
  assert.equal(TEMPLATE_KEYS.length, 19, 'CHECKLIST section 9 is 6 + 3 + 10 = 19 Kyriq-sent emails');
  const missing = TEMPLATE_KEYS.filter((k) => !SAMPLES[k]);
  assert.deepEqual(missing, [], `every template needs sample vars, missing: ${missing.join(', ')}`);
  const extra = Object.keys(SAMPLES).filter((k) => !TEMPLATE_KEYS.includes(k as TemplateKey));
  assert.deepEqual(extra, [], `sample vars for templates that do not exist: ${extra.join(', ')}`);
  ok(`${TEMPLATE_KEYS.length} templates, every one with sample variables`);
}

const UNSUB = unsubscribeUrl('a'.repeat(64));

/**
 * Subject plus body with URLs removed. The wording rules below are about what
 * a customer READS; a route called /upload is not copy, and matching it would
 * be the same class of false pass as matching an import instead of a call.
 */
const prose = (r: { out: { subject: string; text: string } }) =>
  `${r.out.subject}\n${r.out.text}`.replace(/https?:\/\/\S+/g, ' ');

/** Rendered copy for every template, with a link where one is required. */
const rendered = TEMPLATE_KEYS.map((key) => ({
  key,
  category: TEMPLATES[key].category,
  out: renderTemplate(key, SAMPLES[key], {
    unsubscribeUrl: TEMPLATES[key].category === 'notification' ? UNSUB : null,
  }),
}));

{
  for (const r of rendered) {
    assert.ok(r.out.subject.trim().length > 8, `${r.key}: subject is empty or trivial`);
    assert.ok(r.out.text.trim().length > 60, `${r.key}: text body is empty or trivial`);
    assert.ok(r.out.html.includes('<!doctype html>'), `${r.key}: html is not a document`);
    // A template whose subject or body still has an unfilled slot.
    assert.ok(
      !/undefined|null|\[object Object\]|\{\{/.test(`${r.out.subject}\n${r.out.text}`),
      `${r.key}: rendered copy contains an unfilled or broken value`
    );
  }
  ok('every template renders a complete subject, text and html body');
}

/* ═══ 2. "processed", never "uploads" ══════════════════════════════════════
 *
 * CHECKLIST section 9 and docs/EMAIL-SPEC-REVIEW.md 4.7: the email spec says
 * "check uploads"; the website, FAQ and STRIPE-BILLING-REQUIREMENTS.md say
 * "processed checks" and count on success. The Stripe document wins
 * (CHECKLIST section 0), so no sentence in any email may use the upload family
 * of words. Checked against RENDERED copy, which is what a customer reads.
 */
{
  const BANNED = /\bupload(s|ed|ing)?\b/i;
  const offenders = rendered.filter((r) => BANNED.test(prose(r))).map((r) => r.key);
  // The URL stripper must not be what is passing this: a planted sentence fails.
  assert.ok(
    BANNED.test(prose({ out: { subject: 'x', text: 'counts 5 check uploads this period' } })),
    'the upload check must still bite on prose after URLs are stripped'
  );
  assert.deepEqual(
    offenders,
    [],
    'these templates use the word "upload", which contradicts the invoice: ' + offenders.join(', ')
  );

  // The count-bearing templates must actually SAY processed, so this check
  // cannot be satisfied by copy that says nothing at all.
  const counters: TemplateKey[] = [
    'trial_started',
    'trial_halfway',
    'trial_checks_warning',
    'trial_checks_exhausted',
    'usage_half',
    'usage_warning',
    'usage_allowance_reached',
    'overage_summary',
  ];
  for (const key of counters) {
    const r = rendered.find((x) => x.key === key)!;
    assert.match(
      prose(r),
      /process(ed|ing)/i,
      `${key} states a count and must say the checks were processed`
    );
  }
  ok('no email says "upload"; all eight count-bearing emails say "processed"');
}

/* ═══ 3. Unsubscribe, for non-transactional mail only ══════════════════════ */

const NOTIFICATION_KEYS = TEMPLATE_KEYS.filter((k) => TEMPLATES[k].category === 'notification');
const TRANSACTIONAL_KEYS = TEMPLATE_KEYS.filter((k) => TEMPLATES[k].category === 'transactional');

{
  assert.ok(NOTIFICATION_KEYS.length >= 6, 'the usage and trial nudges are non-transactional');
  assert.ok(TRANSACTIONAL_KEYS.length >= 10, 'invitations and service notices are transactional');

  // (a) Rendering a notification WITHOUT a link must throw, not warn.
  for (const key of NOTIFICATION_KEYS) {
    assert.throws(
      () => renderTemplate(key, SAMPLES[key], { unsubscribeUrl: null }),
      EmailRenderError,
      `${key} is non-transactional and must refuse to render without an unsubscribe link`
    );
  }

  // (b) Rendered notifications must carry the link in BOTH bodies — a text
  //     part without it is still a non-compliant email.
  for (const key of NOTIFICATION_KEYS) {
    const r = rendered.find((x) => x.key === key)!;
    assert.ok(r.out.html.includes(UNSUB), `${key}: html has no unsubscribe link`);
    assert.ok(r.out.text.includes(UNSUB), `${key}: text body has no unsubscribe link`);
  }

  // (c) Transactional mail must NOT carry one: offering to opt out of an
  //     invitation or a "processing has stopped" notice teaches mail clients
  //     to hide messages the account cannot work without.
  for (const key of TRANSACTIONAL_KEYS) {
    const r = rendered.find((x) => x.key === key)!;
    assert.ok(
      !/unsubscribe|Stop receiving these updates/i.test(r.out.text),
      `${key} is transactional and must not offer an unsubscribe`
    );
  }

  // (d) The transport must consult preferences for notifications and not for
  //     transactional mail, and must set List-Unsubscribe only with a link.
  const sendSrc = code(SEND);
  assert.match(
    sendSrc,
    /category === 'notification'[\s\S]{0,400}recipientPreference\(/,
    'send.ts must resolve preferences for notification mail'
  );
  assert.match(sendSrc, /'List-Unsubscribe-Post'/, 'send.ts must set RFC 8058 one-click headers');
  assert.match(
    sendSrc,
    /if \(unsubUrl\) \{\s*payload\.headers/,
    'List-Unsubscribe must be conditional on there being a link'
  );
  // Failing closed when the preference store is unavailable.
  assert.match(
    sendSrc,
    /pref\.unavailable \|\| !pref\.token/,
    'send.ts must refuse non-transactional mail when it cannot resolve an unsubscribe token'
  );

  // (e) The route exists, is shape-checked, and is idempotent.
  const unsubSrc = code(UNSUBSCRIBE);
  assert.match(unsubSrc, /\[0-9a-f\]\{32,128\}/, 'unsubscribe must shape-check the token');
  assert.match(unsubSrc, /'email_preferences'/, 'unsubscribe must write email_preferences');
  assert.match(unsubSrc, /unsubscribed_at: now/, 'unsubscribe must record when');
  assert.match(unsubSrc, /req\.method !== 'GET' && req\.method !== 'POST'/, 'GET link and one-click POST');
  assert.ok(
    !/req\.query\.email|req\.body\.email/.test(unsubSrc),
    'the unsubscribe link must not take an address from the request — the token identifies the row'
  );
  ok(`${NOTIFICATION_KEYS.length} non-transactional emails carry a working unsubscribe link; ${TRANSACTIONAL_KEYS.length} transactional ones do not`);
}

/* ═══ 4. Unconfigured is honest — behavioural, with a fetch spy ════════════ */

const UNCONFIGURED = emailConfig({});

{
  assert.equal(UNCONFIGURED.configured, false, 'no RESEND_API_KEY means not configured');
  assert.deepEqual(UNCONFIGURED.missing, ['RESEND_API_KEY']);
  // A placeholder is not a key.
  assert.equal(emailConfig({ RESEND_API_KEY: 'your-key-here' }).configured, false);
  assert.equal(emailConfig({ RESEND_API_KEY: '  ' }).configured, false);
  assert.equal(emailConfig({ RESEND_API_KEY: 're_0123456789abcdef' }).configured, true);
  ok('emailConfig rejects an absent, blank or placeholder key');
}

/* Behavioural, moved into behaviouralChecks() at the bottom: tsx compiles
 * these scripts as CJS, where top-level await is a transform error. */

{
  // And the source must not have grown a path that treats unconfigured as fine.
  const sendSrc = code(SEND);
  assert.match(
    sendSrc,
    /if \(!cfg\.configured \|\| !cfg\.apiKey\) \{[\s\S]{0,600}status: 'skipped_unconfigured'/,
    'the unconfigured branch must return before the fetch'
  );
  const unconfiguredAt = sendSrc.indexOf("status: 'skipped_unconfigured'");
  const fetchAt = sendSrc.indexOf('doFetch(RESEND_ENDPOINT');
  assert.ok(unconfiguredAt > 0 && fetchAt > unconfiguredAt, 'the guard must precede the only fetch');
  assert.equal(
    (sendSrc.match(/RESEND_ENDPOINT/g) || []).length,
    2,
    'there must be exactly one send site (the constant plus its single use)'
  );
  ok('exactly one provider call site, and it is behind the unconfigured guard');
}

/* ═══ 5. Send-once is a database constraint ═══════════════════════════════ */

{
  const migration = sql(MIGRATION);
  // 034 must NOT invent a second send-once mechanism.
  assert.ok(
    !/CREATE TABLE[^;]*send_once|CREATE TABLE[^;]*email_notices/i.test(migration),
    '034 must reuse billing_notices for send-once, not create a second table'
  );
  // 033 holds the constraint, and 034 must not weaken it.
  const stripe = sql('supabase/migrations/033_stripe_billing.sql');
  assert.match(
    stripe,
    /CONSTRAINT billing_notices_once UNIQUE \(tenant_id, kind, period_key\)/,
    'the send-once guarantee is this UNIQUE constraint'
  );
  assert.ok(
    !/DROP CONSTRAINT[^;]*billing_notices_once/i.test(migration),
    '034 must not drop the send-once constraint'
  );

  const sendSrc = code(SEND);
  // The claim is an INSERT, and 23505 is what makes a retry a no-op.
  assert.match(sendSrc, /from\('billing_notices'\)\s*\.insert\(/, 'sendOnce must claim by INSERT');
  assert.match(sendSrc, /claimError\.code === '23505'/, 'sendOnce must treat unique_violation as already sent');
  // No "have I sent this?" pre-check anywhere.
  assert.ok(
    !/from\('billing_notices'\)[\s\S]{0,200}\.select\(/.test(sendSrc),
    'sendOnce must not SELECT billing_notices to decide whether to send — that is an application check and loses a race'
  );
  // The claim must come BEFORE the send.
  const claimAt = sendSrc.indexOf("from('billing_notices')");
  const sendAt = sendSrc.indexOf('await sendEmail({ ...rest');
  assert.ok(claimAt > 0 && sendAt > claimAt, 'the claim must be written before the send is attempted');
  ok('send-once is billing_notices UNIQUE (tenant_id, kind, period_key), claimed before sending');
}

/* Behavioural, moved into behaviouralChecks() — see above. */

/* ═══ 6. QuickBooks health ════════════════════════════════════════════════ */

{
  const migration = sql(MIGRATION);
  for (const column of ['status', 'status_detail', 'status_checked_at', 'status_changed_at']) {
    assert.ok(
      new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`).test(migration),
      `034 must add qb_connections.${column}`
    );
  }
  assert.match(migration, /to_regclass\('public\.qb_connections'\)/, 'the qb block must be guarded');
  assert.match(
    migration,
    /CHECK \(status IN \('connected', 'needs_reconnect', 'error', 'revoked', 'unknown'\)\)/,
    "the status domain must include 'unknown'"
  );
  ok('034 adds guarded qb_connections health columns with a constrained domain');
}

{
  // There is now exactly ONE refresh path: lib/qb-token.ts. The eleven copies
  // of the Intuit exchange were consolidated onto it, so the health assertions
  // that used to be made against the two wired paths are made against the one
  // resolver — and scripts/check-qb-switchers.ts fails if any file grows its
  // own `grant_type: 'refresh_token'` again.
  for (const file of [QB_TOKEN]) {
    const src = code(file);
    assert.match(
      src,
      /markQbConnection\(/,
      `${file} performs a token refresh and must record connection health through markQbConnection`
    );
    // On the FAILURE branch specifically, not only on success. Asserting
    // merely that markQbConnection appears somewhere in the file let a mutant
    // survive: these paths call it on three branches, so the one that matters
    // can be removed without the name disappearing.
    assert.match(
      src,
      /markQbConnection\(\{[\s\S]{0,300}?status: classifyRefreshFailure\(/,
      `${file} must pass the CLASSIFIED failure to markQbConnection on the refresh-failure branch`
    );
    // Failure, recovery, and the missing-credentials case.
    assert.ok(
      (src.match(/markQbConnection\(/g) || []).length >= 3,
      `${file} must record health on every refresh outcome, not just one`
    );
    assert.match(
      src,
      /status: 'connected'/,
      `${file} must clear the status on a successful refresh, or one transient failure flags a firm forever`
    );
  }
  // Exactly one writer.
  assert.match(code(QB_HEALTH), /from\('qb_connections'\)\s*\.update\(/, 'qb-health owns the status write');
  for (const file of [QB_TOKEN, MATCH_HELPERS, PULL_CHECKS, HEALTH_CHECK]) {
    assert.ok(
      !/from\('qb_connections'\)[\s\S]{0,120}\.update\(\{[\s\S]{0,200}status:/.test(code(file)),
      `${file} must write status through markQbConnection, not with its own update`
    );
  }
  ok('the one refresh path records health through the one helper, and nothing else writes status');
}

{
  // Honest when it cannot find out, and only real rejections email a firm.
  assert.equal(classifyRefreshFailure(400, '{"error":"invalid_grant"}'), 'needs_reconnect');
  assert.equal(classifyRefreshFailure(400, 'token revoked by user'), 'revoked');
  assert.equal(classifyRefreshFailure(401, ''), 'needs_reconnect');
  assert.equal(classifyRefreshFailure(503, 'Service Unavailable'), 'error');
  assert.equal(classifyRefreshFailure(500, ''), 'error');
  assert.equal(classifyRefreshFailure(null, ''), 'unknown', 'a network failure is not a dead connection');

  assert.equal(warrantsReconnectEmail('needs_reconnect'), true);
  assert.equal(warrantsReconnectEmail('revoked'), true);
  assert.equal(warrantsReconnectEmail('error'), false, 'a transient error must not email a firm');
  assert.equal(warrantsReconnectEmail('unknown'), false, '"we could not find out" must not email a firm');
  assert.equal(warrantsReconnectEmail('connected'), false);

  const health = code(HEALTH_CHECK);
  assert.match(health, /warrantsReconnectEmail\(status\)/, 'the health check must gate its email on that');
  assert.match(health, /getValidToken\(/, 'the health check must reuse the existing refresh path');
  assert.ok(
    !/grant_type/.test(health),
    'the health check must NOT implement a twelfth token exchange — Intuit rotates refresh tokens and a discarded one breaks the connection it was checking'
  );
  assert.match(health, /isMissingSchema\(error\)/, 'a missing column must not be read as an unhealthy connection');
  ok('health classification is honest: only a real rejection emails a firm, and no new token exchange');
}

/* ═══ 7. Usage notices come from the one resolver ══════════════════════════ */

{
  const notices = code(NOTICES);
  assert.match(notices, /rpc\('tenant_usage_state'/, 'usage notices must come from tenant_usage_state()');
  assert.ok(
    !/trial_ends_at.*Date\.now\(\)|Date\.now\(\)[\s\S]{0,80}trial_check_limit/.test(notices),
    'the notices route must not recompute trial state locally — the gate and the email would drift'
  );

  const base = {
    tenant_id: '00000000-0000-0000-0000-000000000001',
    is_comped: false,
    processing_allowed: true,
    block_reason: null,
    trial_check_limit: 250,
    trial_ends_at: '2026-11-01T00:00:00Z',
    days_remaining: 10,
  };
  const kinds = (s: any) => decideNotices(s).map((d) => d.kind);

  // A comped pilot firm is never nagged.
  assert.deepEqual(kinds({ ...base, is_comped: true, trial_checks_used: 240 }), []);

  // Trial thresholds are exclusive, and highest wins.
  assert.ok(kinds({ ...base, trial_checks_used: 10 }).includes('trial_started'));
  assert.ok(!kinds({ ...base, trial_checks_used: 10 }).includes('trial_halfway'));
  assert.ok(kinds({ ...base, trial_checks_used: 125 }).includes('trial_halfway'));
  assert.ok(!kinds({ ...base, trial_checks_used: 200 }).includes('trial_halfway'));
  assert.ok(kinds({ ...base, trial_checks_used: 200 }).includes('trial_checks_warning'));
  assert.ok(kinds({ ...base, trial_checks_used: 20, days_remaining: 3 }).includes('trial_ending_soon'));
  assert.ok(!kinds({ ...base, trial_checks_used: 20, days_remaining: 9 }).includes('trial_ending_soon'));

  // Blocked trial: the email agrees with the gate, and says only one thing.
  const blocked = kinds({
    ...base,
    processing_allowed: false,
    block_reason: 'trial_check_limit_reached',
    trial_checks_used: 250,
  });
  assert.ok(blocked.includes('trial_checks_exhausted'));
  assert.ok(!blocked.includes('trial_checks_warning'), 'a blocked firm is not told it is nearly there');

  // Paid: never blocked, rolls into overage.
  const paid = (used: number) =>
    kinds({
      tenant_id: base.tenant_id,
      is_comped: false,
      subscription_status: 'active',
      plan: 'growth',
      plan_check_allowance: 1000,
      billing_period_start: '2026-10-01',
      billing_period_end: '2026-10-31',
      checks_used_this_period: used,
    });
  assert.deepEqual(paid(100), []);
  assert.deepEqual(paid(500), ['usage_half']);
  assert.deepEqual(paid(800), ['usage_warning']);
  assert.deepEqual(paid(1000), ['usage_allowance_reached']);
  assert.deepEqual(paid(1200), ['usage_allowance_reached', 'overage_summary']);
  // No trial email ever reaches a paying firm.
  for (const used of [100, 500, 800, 1000, 1200]) {
    assert.ok(!paid(used).some((k) => k.startsWith('trial')), 'a paid firm gets no trial email');
  }

  // Stripe's own four notices are not rebuilt.
  assert.deepEqual(
    kinds({ ...base, subscription_status: 'past_due', trial_checks_used: 10 }),
    [],
    'failed payment is Stripe-native; mailing it here would double up'
  );
  ok('usage notices are exclusive, trial/paid asymmetric, comped-exempt, and Stripe-native ones skipped');
}

/* ═══ 8. The six ready triggers are actually wired ════════════════════════ */

{
  const invite = code(INVITE);
  assert.match(invite, /sendOnce\(/, 'the invite route must send the invitation');
  assert.match(invite, /template: 'team_invitation'/);
  assert.match(invite, /kind: 'team_invitation'/);
  assert.match(invite, /periodKey: invitation\.id/, 'send-once per invitation, so a resend works');
  assert.ok(
    !/email_sent: false/.test(invite),
    'invite.ts must no longer hardcode email_sent: false — that was the dead end'
  );
  assert.match(invite, /email_sent: mail\.sent/, 'the response must report the real outcome');
  assert.match(invite, /invite_url: url/, 'the link must still be returned when the transport is down');

  const member = code(MEMBER);
  assert.match(member, /template: 'team_member_removed'/);
  assert.match(member, /template: 'team_role_changed'/);

  const accept = code(ACCEPT);
  assert.match(accept, /template: 'team_invitation_accepted'/);
  assert.match(accept, /template: 'team_invitation_expired'/);

  const notices = code(NOTICES);
  assert.match(notices, /template: 'processing_failed'/);
  assert.match(notices, /template: 'team_invitation_expired'/, 'expiry also needs a sweep, not only a click');
  ok('all six ready triggers are wired: invite, accepted, expired, removed, role changed, processing failed');
}

/* ═══ 9. Sender, reply-to, and the log ════════════════════════════════════ */

{
  const templates = code(TEMPLATES_FILE);
  assert.match(templates, /Kyriq <notifications@updates\.kyriq\.com>/, 'the agreed sender');
  assert.match(templates, /support@kyriq\.com/, 'the agreed reply-to');

  const sendSrc = code(SEND);
  assert.match(sendSrc, /reply_to: cfg\.replyTo/, 'notifications@ never receives mail, so reply-to must be set');

  // Every outcome is recorded. If a branch stops logging, a missing email
  // becomes undiagnosable, which is the whole reason email_log exists.
  const statuses = ['sent', 'failed', 'skipped_unconfigured', 'suppressed'];
  for (const status of statuses) {
    assert.ok(
      sendSrc.includes(`status: '${status}'`),
      `send.ts must record the '${status}' outcome in email_log`
    );
  }
  const migration = sql(MIGRATION);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.email_log/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.email_preferences/);
  assert.match(migration, /email_log_status_check/, 'the status domain is a constraint, not a convention');
  for (const status of [...statuses, 'already_sent']) {
    assert.ok(migration.includes(`'${status}'`), `email_log must allow status '${status}'`);
  }
  // Tenant isolation, the repo's first non-negotiable.
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.equal(
    (migration.match(/tenant_id = public\.user_tenant_id\(\)/g) || []).length,
    2,
    'both new tables must be tenant-isolated for authenticated readers'
  );
  assert.match(migration, /REVOKE ALL ON public\.email_preferences FROM anon/, 'a token must not be enumerable');
  ok('sender, reply-to, every outcome logged, and both new tables tenant-isolated');
}

/* ═══ helpers ═════════════════════════════════════════════════════════════ */

/**
 * A Supabase-shaped stub, just enough for sendOnce and the log writes. Every
 * builder method returns `this`, and the promise resolves to the configured
 * answer, which is how the real client behaves for these call shapes.
 */
function fakeSupabase(opts: { insertError?: any } = {}) {
  const chain: any = {
    from() {
      return chain;
    },
    select() {
      return chain;
    },
    eq() {
      return chain;
    },
    maybeSingle() {
      return Promise.resolve({ data: null, error: null });
    },
    update() {
      return chain;
    },
    delete() {
      return chain;
    },
    insert(_row: any) {
      return {
        ...chain,
        then: (resolve: any) => resolve({ data: null, error: opts.insertError ?? null }),
        select: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: opts.insertError ?? null }),
        }),
      };
    },
    then(resolve: any) {
      return resolve({ data: null, error: null });
    },
  };
  return chain;
}


/* ═══ behavioural checks, which need await ════════════════════════════════ */

async function behaviouralChecks() {
  {
  let calls = 0;
  const spy: any = async () => {
    calls += 1;
    return new Response(JSON.stringify({ id: 'should-never-happen' }), { status: 200 });
  };

  const result = await sendEmail({
    to: 'someone@example.com',
    template: 'team_invitation',
    vars: SAMPLES.team_invitation,
    config: UNCONFIGURED,
    fetchImpl: spy,
    db: fakeSupabase(),
  });

  assert.equal(calls, 0, 'an unconfigured transport must not contact the provider at all');
  assert.equal(result.sent, false, 'an unconfigured transport must not report a send');
  assert.equal(result.status, 'skipped_unconfigured');
  assert.match(String(result.reason), /RESEND_API_KEY/);
  // It still rendered, so the log row says what WOULD have gone out.
  assert.ok(result.subject && result.subject.length > 8, 'the skipped row must carry the real subject');
  ok('sendEmail with no key: fetch never called, status skipped_unconfigured, subject still recorded');
}

  {
  // Behavioural: a fake client that answers 23505 must make sendOnce a no-op.
  const fake = fakeSupabase({ insertError: { code: '23505', message: 'duplicate key value' } });
  let calls = 0;
  const result = await sendOnce({
    tenantId: '00000000-0000-0000-0000-000000000001',
    kind: 'usage_warning',
    periodKey: '2026-10-01',
    to: 'admin@example.com',
    template: 'usage_warning',
    vars: SAMPLES.usage_warning,
    db: fake,
    config: emailConfig({ RESEND_API_KEY: 're_0123456789abcdef' }),
    fetchImpl: (async () => {
      calls += 1;
      return new Response('{}', { status: 200 });
    }) as any,
  });
  assert.equal(result.status, 'already_sent', 'a duplicate claim means already sent');
  assert.equal(result.sent, false);
  assert.equal(calls, 0, 'a retried send-once must not contact the provider');
  ok('sendOnce on a duplicate claim: no provider call, status already_sent');
}
}

/* ═══ report ══════════════════════════════════════════════════════════════════════ */

behaviouralChecks()
  .then(() => {
    console.log('check-email — CHECKLIST section 9\n');
    console.log(results.join('\n'));
    console.log(`\n${results.length} checks passed.`);
    console.log(
      '\nNOT verified, and not verifiable here: deliverability. There is no RESEND_API_KEY in' +
        ' this environment, updates.kyriq.com has no SPF/DKIM/DMARC yet, and no email from this' +
        ' code has ever been delivered. Everything above is behaviour and shape.'
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
