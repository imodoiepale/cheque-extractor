/**
 * Self-check for Stripe billing (CHECKLIST section 7).
 *
 *   cd frontend && npx tsx scripts/check-stripe-billing.ts
 *
 * No test framework, by the same reasoning as scripts/check-parcel-h.ts. These
 * are the failures that would ship unnoticed, and each one has already
 * happened somewhere:
 *
 *  1. A plan figure drifts. The table now lives in THREE places — the
 *     catalogue module, the billing page's literal array (whose shape parcel H
 *     pins) and plan_check_allowance_for() in migration 033. All three are
 *     compared against CHECKLIST.md field by field, so any one of them moving
 *     alone is a failure.
 *  2. An annual subscriber gets an annual POOL of cheques. The allowance must
 *     be the monthly number on both intervals.
 *  3. Webhook idempotency degrades into an application check. The guarantee is
 *     a PRIMARY KEY; a `select ... where event_id = ?` would pass a casual
 *     review and lose a race.
 *  4. Something grants paid access without a verified webhook. A success-page
 *     redirect is a URL the customer can type.
 *  5. Signature verification stops rejecting something. This one is tested
 *     BEHAVIOURALLY against the real function, with four mutants, because
 *     Stripe is unauthenticated in this environment and no live webhook has
 *     ever reached this code.
 *  6. A price id gets hardcoded, or a test price leaks into live.
 *
 * Checks that read source are run against COMMENT-STRIPPED source, because the
 * files deliberately describe what must not happen and a check satisfied by its
 * own documentation is not a check.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  PLANS,
  allowanceForPlan,
  overageEstimate,
  planFromPriceId,
  priceEnvVar,
  priceId,
  requiredPriceEnvVars,
} from '../lib/billing/plans';
import { verifyStripeSignature, stripeConfig, stripeEnvFromKey, toForm } from '../lib/billing/stripe';
import { annualEnabled, ANNUAL_FLAG } from '../lib/billing/annual';
import { cronAuthorised } from '../lib/billing/service';

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
/** SQL comments are `--`; the same reasoning applies to the migration. */
const sql = (rel: string) => readRepo(rel).replace(/^\s*--[^\n]*$/gm, '');

const MIGRATION = 'supabase/migrations/033_stripe_billing.sql';
const BILLING_PAGE = 'app/(app)/billing/page.tsx';
const WEBHOOK = 'pages/api/billing/webhook.ts';
const CHECKOUT = 'pages/api/billing/checkout.ts';
const ANNUAL_ROUTE = 'pages/api/billing/subscribe-annual.ts';
const PLAN_CHANGE = 'pages/api/billing/plan-change.ts';
const REPORT_USAGE = 'pages/api/billing/report-usage.ts';
const REFUND = 'pages/api/admin/billing-refund.ts';
const SUBSCRIPTION = 'pages/api/billing/subscription.ts';

const migration = sql(MIGRATION);

/* --- 1. The plan table, parsed from CHECKLIST section 7 ----------------- */

{
  const checklist = readRepo('CHECKLIST.md');
  const num = (s: string) => parseFloat(s.replace(/[$,]/g, ''));

  const rows = [
    ...checklist.matchAll(
      /^\|\s*(Essential|Professional[^|]*|Scale)\s*\|\s*(\$[\d,]+)\s*\|\s*(\$[\d,]+)\s*\|\s*([\d,]+)\s*\|\s*(\$[\d.]+)\s*\|/gm
    ),
  ];
  assert.equal(rows.length, 3, 'could not parse the three plan rows out of CHECKLIST section 7');

  const pageSrc = read(BILLING_PAGE);

  for (const [, nameRaw, monthly, annual, checks, overage] of rows) {
    const name = nameRaw.trim().replace(/\s*\(.*\)$/, '');
    const key = name.toLowerCase();

    /* (a) the catalogue module — compared as VALUES, not as text */
    const plan = PLANS.find((p) => p.key === key);
    assert.ok(plan, `lib/billing/plans.ts has no '${key}' plan, but CHECKLIST section 7 does`);
    assert.equal(plan!.monthly, num(monthly), `plans.ts: ${name} monthly price`);
    assert.equal(plan!.annual, num(annual), `plans.ts: ${name} annual price`);
    assert.equal(plan!.includedChecks, num(checks), `plans.ts: ${name} included cheques`);
    assert.equal(plan!.overage, num(overage), `plans.ts: ${name} overage rate`);
    assert.equal(plan!.name, name, `plans.ts: ${key} display name`);

    /* (b) the billing page's literal array (parcel H pins its shape) */
    assert.match(
      pageSrc,
      new RegExp(
        `\\{\\s*name: '${name}',\\s*monthly: ${num(monthly)},\\s*annual: ${num(annual)},` +
          `\\s*includedChecks: ${num(checks)},\\s*overage: ${num(overage)}`
      ),
      `${BILLING_PAGE}: the ${name} row disagrees with CHECKLIST section 7`
    );

    /* (c) the SQL that actually writes tenants.plan_check_allowance */
    assert.match(
      migration,
      new RegExp(`WHEN\\s+'${key}'\\s+THEN\\s+${num(checks)}\\b`, 'i'),
      `${MIGRATION}: plan_check_allowance_for('${key}') must return ${num(checks)}`
    );

    /* (d) the helpers callers actually use */
    assert.equal(allowanceForPlan(key), num(checks), `allowanceForPlan('${key}')`);
    assert.equal(
      overageEstimate(key, num(checks) + 100).amount,
      Math.round(100 * num(overage) * 100) / 100,
      `overageEstimate('${key}'): 100 cheques over allowance`
    );
    assert.equal(overageEstimate(key, num(checks)).units, 0, `overageEstimate('${key}') at exactly the allowance`);
  }

  assert.equal(PLANS.length, 3, 'lib/billing/plans.ts has a plan CHECKLIST section 7 does not');
  assert.equal(
    PLANS.filter((p) => p.popular).map((p) => p.key).join(','),
    'professional',
    'Professional is the "Most Popular" plan in CHECKLIST section 7'
  );
  console.log('  ok  all three plans match CHECKLIST section 7 in the catalogue, the page and the SQL');
}

/* --- 2. The allowance is MONTHLY on both intervals ---------------------- */

{
  // "Monthly allowance resets monthly for annual customers too. Not one annual
  // pool." Nothing may scale the allowance by the interval.
  for (const plan of PLANS) {
    assert.equal(
      allowanceForPlan(plan.key),
      plan.includedChecks,
      `allowanceForPlan('${plan.key}') must be the monthly number on every interval`
    );
  }

  const planSrc = code('lib/billing/plans.ts');
  assert.doesNotMatch(
    planSrc,
    /includedChecks\s*\*\s*12|\*\s*12\s*;|annualChecks/,
    'lib/billing/plans.ts multiplies an allowance by 12 — an annual plan is a cheaper monthly ' +
      'allowance, not a yearly pool'
  );

  // The SQL allowance must not branch on the billing frequency.
  const allowanceFn = migration.match(
    /CREATE OR REPLACE FUNCTION public\.plan_check_allowance_for[\s\S]*?LANGUAGE SQL IMMUTABLE/
  );
  assert.ok(allowanceFn, `${MIGRATION}: plan_check_allowance_for() not found`);
  assert.doesNotMatch(
    allowanceFn![0],
    /frequency|interval|annual|month/i,
    `${MIGRATION}: plan_check_allowance_for() must not depend on the billing interval`
  );

  // And the single writer must take the allowance from that function.
  assert.match(
    migration,
    /plan_check_allowance\s*=\s*COALESCE\(\s*_allowance/,
    `${MIGRATION}: apply_stripe_subscription() must set plan_check_allowance from plan_check_allowance_for()`
  );
  assert.match(
    migration,
    /_allowance\s*:=\s*public\.plan_check_allowance_for\(p_plan\)/,
    `${MIGRATION}: the allowance must be derived from the plan, not from the price or the interval`
  );
  console.log('  ok  the cheque allowance is the monthly figure on both intervals, in TS and in SQL');
}

/* --- 3. Webhook idempotency is a CONSTRAINT ----------------------------- */

{
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.stripe_events[\s\S]*?event_id\s+TEXT\s+PRIMARY KEY/,
    `${MIGRATION}: stripe_events.event_id must be the PRIMARY KEY — that constraint IS the idempotency`
  );
  assert.match(
    migration,
    /INSERT INTO public\.stripe_events[\s\S]*?ON CONFLICT \(event_id\) DO NOTHING/,
    `${MIGRATION}: begin_stripe_event() must claim the event through ON CONFLICT on the primary key`
  );
  for (const verdict of ['new', 'retry', 'duplicate']) {
    assert.match(
      migration,
      new RegExp(`RETURN '${verdict}'`),
      `${MIGRATION}: begin_stripe_event() must distinguish '${verdict}' — collapsing the three ` +
        'either double-applies an event or loses one that crashed mid-processing'
    );
  }

  const hook = code(WEBHOOK);
  assert.match(hook, /begin_stripe_event/, `${WEBHOOK} must claim every event via begin_stripe_event`);
  assert.match(
    hook,
    /claim === 'duplicate'[\s\S]{0,200}status\(200\)/,
    `${WEBHOOK}: a duplicate must answer 200 and do nothing, so Stripe stops retrying`
  );
  assert.match(
    hook,
    /finish_stripe_event/,
    `${WEBHOOK} must mark the event finished, or every delivery would look like a crashed retry`
  );

  /* The negative half. An application-level "have I seen this id?" read is the
     exact degradation this check exists to catch: it passes review and loses a
     race between two concurrent deliveries. */
  assert.doesNotMatch(
    hook,
    /from\(['"]stripe_events['"]\)/,
    `${WEBHOOK} queries stripe_events directly — idempotency must come from begin_stripe_event's ` +
      'primary-key claim, not from a read-then-write in the handler'
  );
  assert.ok(
    !/bodyParser:\s*true/.test(hook) && /bodyParser:\s*false/.test(hook),
    `${WEBHOOK} must disable the body parser; the signature is computed over the raw bytes`
  );

  /* The ledger side of exactly-once. */
  const reporter = code(REPORT_USAGE);
  assert.match(
    reporter,
    /identifier:\s*row\.id/,
    `${REPORT_USAGE}: the meter event's identifier must be the ledger row id, so Stripe dedupes a re-send`
  );
  assert.match(
    reporter,
    /\.is\('stripe_event_id',\s*null\)/,
    `${REPORT_USAGE}: the stamp must be conditional on the row not already being stamped`
  );
  const updateBlock = reporter.match(/\.update\(\{([\s\S]*?)\}\)/);
  assert.ok(updateBlock, `${REPORT_USAGE}: no usage_ledger update found`);
  const updatedKeys = [...updateBlock![1].matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]).sort();
  assert.deepEqual(
    updatedKeys,
    ['stripe_event_id', 'stripe_reported_at'],
    `${REPORT_USAGE} updates ${JSON.stringify(updatedKeys)} on the append-only ledger — migration 027 ` +
      'permits those two columns and nothing else'
  );
  console.log('  ok  webhook idempotency is a primary key, and ledger reporting is exactly-once');
}

/* --- 4. Paid access comes ONLY from a verified webhook ------------------ */

{
  /* (a) The grant is service-role only at the database level. */
  assert.match(
    migration,
    /REVOKE ALL ON FUNCTION public\.apply_stripe_subscription\([\s\S]*?\) FROM PUBLIC, authenticated, anon;/,
    `${MIGRATION}: apply_stripe_subscription() must be revoked from authenticated and anon`
  );
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.apply_stripe_subscription\([\s\S]*?\) TO service_role;/,
    `${MIGRATION}: apply_stripe_subscription() must be granted to service_role only`
  );

  /* (b) Exactly one file in the app may call it. */
  const callers = [...walk(path.join(root, 'pages')), ...walk(path.join(root, 'app')), ...walk(path.join(root, 'lib'))]
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => strip(readFileSync(f, 'utf8')).includes('apply_stripe_subscription'))
    .map((f) => path.relative(root, f).replace(/\\/g, '/'))
    .sort();
  assert.deepEqual(
    callers,
    [WEBHOOK],
    `apply_stripe_subscription() is called from ${JSON.stringify(callers)} — only the ` +
      'signature-verified webhook may grant paid access'
  );

  /* (c) The signature is verified BEFORE the body is parsed or claimed. */
  /* Measured inside the HANDLER BODY, and on the CALL, not the identifier.
     Indexing the whole file found the `import { verifyStripeSignature }` line,
     so deleting the call itself left this assertion passing — that mutant
     survived until this was narrowed. */
  const hook = code(WEBHOOK);
  const handlerAt = hook.indexOf('export default async function handler');
  assert.ok(handlerAt > 0, `${WEBHOOK}: handler not found`);
  const body = hook.slice(handlerAt);
  const iVerify = body.indexOf('verifyStripeSignature(');
  const iParse = body.indexOf('JSON.parse');
  const iClaim = body.indexOf('begin_stripe_event');
  assert.ok(iVerify >= 0, `${WEBHOOK} never CALLS verifyStripeSignature inside the handler`);
  assert.ok(iParse >= 0 && iClaim >= 0, `${WEBHOOK}: expected the body parse and the event claim`);
  assert.ok(iVerify < iParse, `${WEBHOOK} parses the body before verifying the signature`);
  assert.ok(iVerify < iClaim, `${WEBHOOK} claims the event before verifying the signature`);
  /* And the failure must stop the request rather than be logged and ignored. */
  assert.match(
    body,
    /catch[\s\S]{0,220}signature_invalid/,
    `${WEBHOOK}: a rejected signature must end the request, not fall through`
  );

  /* Ordering alone cannot see a guard that has been switched off: wrapping the
     verify in `if (false)` keeps the call in the right place and survived a
     text-order check. So the step between reading the body and verifying it
     must contain no branch at all — verification is unconditional. */
  const iRaw = body.indexOf('readRawBody(req)');
  assert.ok(iRaw >= 0 && iRaw < iVerify, `${WEBHOOK}: the raw body must be read before verification`);
  const between = body.slice(iRaw, iVerify);
  assert.doesNotMatch(
    between,
    /\bif\s*\(/,
    `${WEBHOOK}: signature verification is behind a branch — it must be unconditional for every delivery`
  );

  /* A dead guard anywhere in the billing code is the same failure in a different
     place, and it is never intentional here. */
  for (const rel of [
    WEBHOOK, CHECKOUT, ANNUAL_ROUTE, PLAN_CHANGE, REPORT_USAGE, REFUND, SUBSCRIPTION,
    'pages/api/billing/cancel.ts',
    'pages/api/billing/reactivate.ts',
    'pages/api/billing/renewal-reminders.ts',
    'lib/billing/stripe.ts',
    'lib/billing/service.ts',
    'lib/billing/annual.ts',
    'lib/billing/plans.ts',
  ]) {
    assert.doesNotMatch(
      code(rel),
      /\bif\s*\(\s*(?:false|true)\s*\)/,
      `${rel} has a guard hardcoded to a constant — a disabled check reads as a live one`
    );
  }

  /* (d) No route may write an active subscription status. Only the SQL
         function does, and only the webhook calls it. */
  const writers = [...walk(path.join(root, 'pages')), ...walk(path.join(root, 'app')), ...walk(path.join(root, 'lib'))]
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => /subscription_status:\s*'active'/.test(strip(readFileSync(f, 'utf8'))))
    .map((f) => path.relative(root, f).replace(/\\/g, '/'));
  assert.deepEqual(
    writers,
    [],
    `${JSON.stringify(writers)} sets subscription_status to 'active' directly — activation belongs to ` +
      'apply_stripe_subscription(), called from the verified webhook'
  );

  /* (e) The return-from-Stripe URL must not claim success, and the page must
         not act on it. */
  const checkout = code(CHECKOUT);
  assert.match(
    checkout,
    /success_url:[^\n]*checkout=confirming/,
    `${CHECKOUT}: the return URL must say "confirming", not "success" — a redirect is ` +
      'attacker-controllable and grants nothing'
  );
  /* Reading subscription_status to refuse an already-subscribed firm is fine;
     WRITING it is not. The pattern is the assignment form only. */
  assert.doesNotMatch(
    checkout,
    /checkout=success|subscription_status:|plan_check_allowance:|subscription_status\s*=[^=]/,
    `${CHECKOUT} writes subscription state — the checkout route may only create a Stripe session`
  );

  const page = code(BILLING_PAGE);
  assert.match(
    page,
    /returnedFrom === 'confirming'/,
    `${BILLING_PAGE} should render the return from Stripe as "confirming"`
  );
  assert.doesNotMatch(
    page,
    /setSub\(\s*\{[\s\S]{0,400}status:\s*'active'/,
    `${BILLING_PAGE} fabricates an active subscription client-side after a redirect`
  );
  console.log('  ok  paid access is granted only by the verified webhook; no redirect path can do it');
}

/* --- 5. Signature verification, tested behaviourally ------------------- */

{
  const secret = 'whsec_test_only_not_a_real_secret';
  const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
  const now = 1_700_000_000;
  const sign = (ts: number, payload: string, key = secret) =>
    crypto.createHmac('sha256', key).update(`${ts}.${payload}`, 'utf8').digest('hex');

  // The happy path, so the mutants below mean something.
  assert.deepEqual(
    verifyStripeSignature(body, `t=${now},v1=${sign(now, body)}`, secret, now),
    { timestamp: now },
    'a correctly signed payload must verify'
  );

  // Rotation: several v1 signatures, one of which matches.
  assert.doesNotThrow(
    () => verifyStripeSignature(body, `t=${now},v1=${sign(now, body, 'old')},v1=${sign(now, body)}`, secret, now),
    'during a secret rotation Stripe sends several v1 signatures; any match is a pass'
  );

  const rejects: Array<[string, () => unknown]> = [
    ['a tampered body', () => verifyStripeSignature(body.replace('invoice.paid', 'invoice.void'), `t=${now},v1=${sign(now, body)}`, secret, now)],
    ['the wrong secret', () => verifyStripeSignature(body, `t=${now},v1=${sign(now, body, 'wrong')}`, secret, now)],
    ['a replayed timestamp', () => verifyStripeSignature(body, `t=${now - 3600},v1=${sign(now - 3600, body)}`, secret, now)],
    ['a missing v1', () => verifyStripeSignature(body, `t=${now}`, secret, now)],
    ['a missing header', () => verifyStripeSignature(body, undefined, secret, now)],
    ['no configured secret', () => verifyStripeSignature(body, `t=${now},v1=${sign(now, body)}`, null, now)],
    ['a truncated signature', () => verifyStripeSignature(body, `t=${now},v1=${sign(now, body).slice(0, 10)}`, secret, now)],
  ];
  for (const [label, fn] of rejects) {
    assert.throws(fn, /signature|secret/i, `verifyStripeSignature accepted ${label}`);
  }
  console.log(`  ok  signature verification accepts a valid signature and rejects ${rejects.length} mutants`);
}

/* --- 6. Price ids come from the environment, split test/live ------------ */

{
  // Nine variables per environment: 3 plans x (monthly, annual, overage).
  assert.equal(requiredPriceEnvVars('test').length, 9, 'nine test price ids are required');
  assert.equal(requiredPriceEnvVars('live').length, 9, 'nine live price ids are required');
  const overlap = requiredPriceEnvVars('test').filter((v) => requiredPriceEnvVars('live').includes(v));
  assert.deepEqual(overlap, [], `test and live share the variable(s) ${JSON.stringify(overlap)}`);
  assert.equal(priceEnvVar('live', 'scale', 'overage'), 'STRIPE_PRICE_LIVE_SCALE_OVERAGE');

  // Resolution really reads the environment, and an absent id is null rather
  // than a fallback that would charge the wrong price.
  const fake = { STRIPE_PRICE_TEST_ESSENTIAL_MONTHLY: ' price_abc ' };
  assert.equal(priceId('test', 'essential', 'monthly', fake), 'price_abc', 'price ids are read and trimmed from env');
  assert.equal(priceId('test', 'essential', 'annual', fake), null, 'a missing price id must be null');
  assert.equal(priceId('live', 'essential', 'monthly', fake), null, 'a test price id must never answer for live');

  assert.deepEqual(planFromPriceId('price_abc', 'test', fake), { plan: 'essential', kind: 'monthly' });
  assert.equal(planFromPriceId('price_abc', 'live', fake), null, 'a live lookup must not resolve a test price');
  assert.equal(planFromPriceId('price_unknown', 'test', fake), null, 'an unknown price must not resolve to a plan');

  // No literal price id anywhere in the billing code.
  for (const rel of [
    'lib/billing/plans.ts',
    'lib/billing/stripe.ts',
    'lib/billing/service.ts',
    'lib/billing/annual.ts',
    CHECKOUT,
    ANNUAL_ROUTE,
    PLAN_CHANGE,
    WEBHOOK,
    SUBSCRIPTION,
  ]) {
    const hits = code(rel).match(/['"`]price_[A-Za-z0-9]+['"`]/g);
    assert.equal(hits, null, `${rel} hardcodes the price id(s) ${JSON.stringify(hits)} — they belong in env`);
  }

  // The environment is derived from the key, so a mislabelled STRIPE_ENV cannot
  // point live keys at test prices.
  assert.equal(stripeEnvFromKey('sk_test_123'), 'test');
  assert.equal(stripeEnvFromKey('sk_live_123'), 'live');
  assert.equal(stripeEnvFromKey('rk_live_123'), 'live');
  assert.equal(stripeEnvFromKey('nonsense'), null);
  const mismatch = stripeConfig({ STRIPE_SECRET_KEY: 'sk_live_1', STRIPE_WEBHOOK_SECRET: 'w', STRIPE_ENV: 'test' });
  assert.equal(mismatch.configured, false, 'a STRIPE_ENV that contradicts the key must not be usable');
  assert.match(String(mismatch.reason), /Refusing to guess/);
  assert.equal(
    stripeConfig({}).configured,
    false,
    'with no keys at all the integration must report itself unconfigured'
  );
  console.log('  ok  price ids are environment-only, split test/live, and the environment is derived from the key');
}

/* --- 7. The plan resolved from the price, never from metadata ---------- */

{
  const hook = code(WEBHOOK);
  const applyFn = hook.match(/async function applySubscription\([\s\S]*?\n\}/);
  assert.ok(applyFn, `${WEBHOOK}: applySubscription() not found`);
  assert.match(
    applyFn![0],
    /planFromPriceId/,
    `${WEBHOOK}: applySubscription() must resolve the plan from the price id`
  );
  assert.doesNotMatch(
    applyFn![0],
    /metadata/,
    `${WEBHOOK}: applySubscription() reads metadata — metadata is client-supplied, so it could award ` +
      'a Scale allowance on an Essential price. The price id is what Stripe actually charges.'
  );
  console.log('  ok  the plan is resolved from the Stripe price id, not from client-supplied metadata');
}

/* --- 8. Exactly the eight webhooks from the checklist ------------------- */

{
  const hook = read(WEBHOOK);
  const handled = hook.match(/const HANDLED = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(handled, `${WEBHOOK}: the HANDLED set was not found`);
  const got = [...handled![1].matchAll(/'([a-z_.]+)'/g)].map((m) => m[1]).sort();
  const want = [
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.deleted',
    'customer.subscription.updated',
    'invoice.created',
    'invoice.finalized',
    'invoice.paid',
    'invoice.payment_failed',
  ];
  assert.deepEqual(got, want, 'the eight webhooks in CHECKLIST section 7 must all be handled, and only those');
  for (const type of want) {
    assert.ok(
      new RegExp(`case '${type}'`).test(hook),
      `${WEBHOOK} lists ${type} as handled but has no case for it — it would be claimed, marked ` +
        'processed and silently dropped'
    );
  }
  console.log('  ok  all eight webhooks are declared AND switched on');
}

/* --- 9. Annual is labelled unverified, not presented as finished -------- */

{
  assert.equal(ANNUAL_FLAG, 'STRIPE_ANNUAL_ENABLED');
  assert.equal(annualEnabled({}), false, 'annual must be off when the flag is unset');
  assert.equal(annualEnabled({ STRIPE_ANNUAL_ENABLED: 'yes' }), false, 'only an explicit "true" enables annual');
  assert.equal(annualEnabled({ STRIPE_ANNUAL_ENABLED: 'TRUE' }), true);

  const annualRoute = code(ANNUAL_ROUTE);
  assert.match(
    annualRoute,
    /if \(!annualEnabled\(\)\)[\s\S]{0,200}status\(501\)/,
    `${ANNUAL_ROUTE} must answer 501 while annual is unverified, before touching Stripe`
  );
  assert.match(
    annualRoute,
    /ANNUAL_UNVERIFIED_MESSAGE/,
    `${ANNUAL_ROUTE} must return the explanation, not a bare 501`
  );
  assert.match(
    code(PLAN_CHANGE),
    /requestedInterval === 'annual' && !annualEnabled\(\)/,
    `${PLAN_CHANGE} must refuse a move to annual while annual is unverified`
  );
  // The flag gate must also sit in front of the creation call itself, so the
  // webhook cannot create an annual subscription the routes refuse to offer.
  assert.match(
    code(WEBHOOK),
    /if \(!annualEnabled\(\)\)/,
    `${WEBHOOK} must not create an annual subscription while annual is unverified`
  );
  console.log('  ok  annual is gated behind STRIPE_ANNUAL_ENABLED in the routes and in the webhook');
}

/* --- 10. Plan changes disclose before they charge ----------------------- */

{
  const src = code(PLAN_CHANGE);
  assert.match(
    src,
    /if \(!body\.confirm\)[\s\S]{0,160}preview: disclosure/,
    `${PLAN_CHANGE}: without confirm the route must return the disclosure and change nothing`
  );
  assert.match(
    src,
    /acknowledgedTotalMinor !== disclosure\.dueNowMinor[\s\S]{0,200}status\(409\)/,
    `${PLAN_CHANGE}: a confirm must echo the figure that was disclosed, or be refused — otherwise a ` +
      'customer can be charged a total they were never shown'
  );
  for (const field of ['chargesMinor', 'creditsMinor', 'dueNowMinor', 'effectiveAt']) {
    assert.ok(src.includes(field), `${PLAN_CHANGE}: the disclosure must include ${field}`);
  }
  assert.match(code(BILLING_PAGE), /acknowledgedTotalMinor: preview\.dueNowMinor/,
    `${BILLING_PAGE}: the confirm button must send back the disclosed figure`);
  console.log('  ok  a plan change discloses charges, credits and the effective date before it applies');
}

/* --- 11. Refunds: Super Admin, a reason, and an unskippable audit ------- */

{
  assert.match(
    migration,
    /reason\s+TEXT NOT NULL CHECK \(length\(btrim\(reason\)\) >= 3\)/,
    `${MIGRATION}: billing_refunds.reason must be enforced by a CHECK, not only by the route`
  );
  assert.match(
    migration,
    /CREATE TRIGGER trg_billing_refunds_audit[\s\S]*?EXECUTE FUNCTION public\.log_billing_refund\(\)/,
    `${MIGRATION}: the refund audit entry must be written by a trigger, so a caller cannot skip it`
  );
  assert.match(
    migration,
    /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.billing_refunds FROM authenticated, anon;/,
    `${MIGRATION}: billing_refunds must not be writable by a tenant session`
  );

  const refund = code(REFUND);
  assert.match(refund, /isSuperAdmin\(ctx\.email\)/, `${REFUND} must gate on the Super Admin allowlist`);
  assert.match(refund, /reason_required/, `${REFUND} must refuse a refund with no recorded reason`);

  const refundWriters = [...walk(path.join(root, 'pages')), ...walk(path.join(root, 'app')), ...walk(path.join(root, 'lib'))]
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => /from\(['"]billing_refunds['"]\)[\s\S]{0,80}\.insert\(/.test(strip(readFileSync(f, 'utf8'))))
    .map((f) => path.relative(root, f).replace(/\\/g, '/'))
    .sort();
  assert.deepEqual(
    refundWriters,
    [REFUND],
    `billing_refunds is inserted from ${JSON.stringify(refundWriters)} — only the Super Admin route may refund`
  );
  console.log('  ok  refunds need a Super Admin, a reason the database enforces, and a logged trigger');
}

/* --- 12. Every billing route is behind a role gate ---------------------- */

{
  const gated: Array<[string, string]> = [
    [CHECKOUT, 'billing.manage'],
    [ANNUAL_ROUTE, 'billing.manage'],
    [PLAN_CHANGE, 'billing.manage'],
    ['pages/api/billing/cancel.ts', 'billing.manage'],
    ['pages/api/billing/reactivate.ts', 'billing.manage'],
    [SUBSCRIPTION, 'billing.view'],
  ];
  for (const [rel, capability] of gated) {
    assert.match(
      code(rel),
      new RegExp(`requireCapability\\(req, res, '${capability.replace('.', '\\.')}'\\)`),
      `${rel} must call requireCapability(req, res, '${capability}') — Users have no billing access`
    );
  }
  for (const rel of [REPORT_USAGE, 'pages/api/billing/renewal-reminders.ts']) {
    assert.match(
      code(rel),
      /cronAuthorised\(req\)/,
      `${rel} is a cron endpoint and must require BILLING_CRON_SECRET`
    );
  }
  // An unset secret must deny, not open the door.
  const saved = process.env.BILLING_CRON_SECRET;
  delete process.env.BILLING_CRON_SECRET;
  assert.equal(
    cronAuthorised({ headers: { authorization: 'Bearer anything' } } as any),
    false,
    'an unset BILLING_CRON_SECRET must deny every caller'
  );
  process.env.BILLING_CRON_SECRET = 's3cret';
  assert.equal(cronAuthorised({ headers: { authorization: 'Bearer s3cret' } } as any), true);
  assert.equal(cronAuthorised({ headers: { authorization: 'Bearer s3cre' } } as any), false);
  assert.equal(cronAuthorised({ headers: {} } as any), false);
  if (saved === undefined) delete process.env.BILLING_CRON_SECRET;
  else process.env.BILLING_CRON_SECRET = saved;
  console.log('  ok  every billing route is behind a capability, and the cron secret denies by default');
}

/* --- 13. Invoice history has a source, or there is no history ----------- */

{
  const page = code(BILLING_PAGE);
  // Parcel H's rule, carried here so it survives an edit to that file: the page
  // previously stamped closed months "Paid" from an array index.
  assert.ok(
    !/'paid'|"paid"|>\s*Paid\s*</i.test(page),
    `${BILLING_PAGE} declares a payment status in its own source — every status must arrive as ` +
      'inv.statusLabel from billing_invoices'
  );
  assert.match(
    page,
    /sub\.invoices\.map/,
    `${BILLING_PAGE}: the invoice list must iterate the rows the endpoint returned`
  );
  assert.match(page, /\{inv\.statusLabel\}/, `${BILLING_PAGE} must render the status the endpoint mapped`);
  assert.match(
    page,
    /sub && sub\.invoices\.length > 0/,
    `${BILLING_PAGE}: no invoice rows must mean no invoice section, not an empty table of months`
  );

  const endpoint = code(SUBSCRIPTION);
  assert.match(
    endpoint,
    /from\('billing_invoices'\)/,
    `${SUBSCRIPTION}: invoice history must come from billing_invoices`
  );
  assert.match(
    endpoint,
    /statusLabel: INVOICE_STATUS_LABEL\[inv\.status\] \?\? inv\.status/,
    `${SUBSCRIPTION}: the label must be a mapping of Stripe's own status, with the raw status as fallback`
  );
  assert.doesNotMatch(
    endpoint,
    /periodLabel|byMonth|getMonth\(\)/,
    `${SUBSCRIPTION} derives invoice rows from calendar months — rows come from Stripe or not at all`
  );
  console.log('  ok  invoice history is rows from billing_invoices; no status is derived from a date');
}

/* --- 14. The form encoder, since every Stripe call depends on it -------- */

{
  assert.equal(
    toForm({ items: [{ price: 'p1', quantity: 1 }], metadata: { tenant_id: 't' } }).toString(),
    'items%5B0%5D%5Bprice%5D=p1&items%5B0%5D%5Bquantity%5D=1&metadata%5Btenant_id%5D=t',
    'nested Stripe parameters must encode as bracketed paths'
  );
  assert.equal(
    toForm({ a: undefined, b: null, c: false, d: 0 }).toString(),
    'c=false&d=0',
    'undefined and null must be dropped; false and 0 must not be'
  );
  console.log('  ok  Stripe form encoding keeps bracketed paths and drops only undefined/null');
}

/* ----------------------------------------------------------------------- */

function walk(dir: string): string[] {
  const { readdirSync, statSync, existsSync } = require('node:fs') as typeof import('node:fs');
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

console.log('\nall Stripe billing checks passed');
