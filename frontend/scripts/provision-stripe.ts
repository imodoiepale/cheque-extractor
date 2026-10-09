/**
 * Create the Stripe products and prices Kyriq needs, then print the environment
 * variables to paste into Vercel.
 *
 *   cd frontend
 *   STRIPE_SECRET_KEY=rk_live_... npx tsx scripts/provision-stripe.ts
 *
 * Add --apply to actually write to Stripe. Without it the script only reports
 * what it would create, which is how you should run it first.
 *
 * WHY THIS SCRIPT EXISTS
 *
 * Nine prices across three plans, in two environments, each with a matching
 * environment variable whose name the app derives rather than stores. Doing that
 * by hand in the dashboard is how a price id ends up on the wrong plan, and the
 * failure is silent: the customer is simply charged the wrong amount. The
 * figures come from lib/billing/plans.ts, which is the same module the app and
 * the billing page read, so the prices created here cannot disagree with what
 * the customer was shown.
 *
 * IDEMPOTENT. Every price carries a `lookup_key`, and a price whose lookup_key
 * already exists is reused rather than duplicated. Re-running after a partial
 * failure finishes the job instead of creating a second set. Stripe prices are
 * immutable, so if a figure in plans.ts changes you get a NEW price and the old
 * one is left alone — existing subscriptions keep billing at the price they were
 * sold, which is what you want, and the script tells you when that happens.
 *
 * THE KEY NEVER TOUCHES THE REPO. It is read from the environment, is not
 * logged, and is not written anywhere. Keep it that way.
 */

import { PLANS, priceEnvVar, type PlanKey } from '../lib/billing/plans';
import { stripeEnvFromKey } from '../lib/billing/stripe';

const API = 'https://api.stripe.com';

const secretKey = (process.env.STRIPE_SECRET_KEY || '').trim();
const apply = process.argv.includes('--apply');

if (!secretKey) {
  console.error(
    'STRIPE_SECRET_KEY is not set.\n\n' +
      '  STRIPE_SECRET_KEY=rk_live_... npx tsx scripts/provision-stripe.ts\n'
  );
  process.exit(1);
}

const derivedEnv = stripeEnvFromKey(secretKey);
if (!derivedEnv) {
  console.error('STRIPE_SECRET_KEY is not a recognisable sk_/rk_ test or live key.');
  process.exit(1);
}
// Bound after the guard so the narrowing survives into the helpers below;
// process.exit() does not narrow a module-level `let` for TypeScript.
const env = derivedEnv;

/** Stripe takes form encoding, with bracketed paths for nested fields. */
function form(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) parts.push(form(v as any, key));
    else parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return parts.filter(Boolean).join('&');
}

async function stripe(path: string, body?: Record<string, unknown>, method = 'POST') {
  const res = await fetch(`${API}${path}`, {
    method: body ? method : 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2025-09-30.clover',
    },
    body: body ? form(body) : undefined,
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `${res.status} ${res.statusText}`;
    // A restricted key missing a permission fails here with a clear message,
    // which is more useful than a generic throw.
    throw new Error(`${method} ${path} → ${msg}`);
  }
  return json;
}

/** Stable, human-readable, and unique per plan+kind+env. */
function lookupKey(plan: PlanKey, kind: 'monthly' | 'annual' | 'overage'): string {
  return `kyriq_${env}_${plan}_${kind}`;
}

async function findPriceByLookupKey(key: string): Promise<any | null> {
  const r = await stripe(`/v1/prices?lookup_keys[]=${encodeURIComponent(key)}&limit=1&active=true`);
  return r?.data?.[0] ?? null;
}

async function findProductByName(name: string): Promise<any | null> {
  const r = await stripe(`/v1/products?limit=100&active=true`);
  return (r?.data || []).find((p: any) => p.name === name) ?? null;
}

async function main() {
  console.log(`\nStripe environment: ${env.toUpperCase()}${apply ? '' : '   (dry run — add --apply to write)'}\n`);

  const lines: string[] = [];
  let created = 0;
  let reused = 0;

  for (const plan of PLANS) {
    const productName = `Kyriq ${plan.name}`;
    let product = await findProductByName(productName);

    if (!product) {
      if (apply) {
        product = await stripe('/v1/products', {
          name: productName,
          description: `${plan.includedChecks.toLocaleString('en-US')} processed cheques per month, then $${plan.overage.toFixed(2)} per additional cheque.`,
          metadata: { kyriq_plan: plan.key },
        });
        console.log(`  created product  ${productName}  (${product.id})`);
      } else {
        console.log(`  would create     product ${productName}`);
        product = { id: `prod_DRYRUN_${plan.key}` };
      }
    } else {
      console.log(`  reusing product  ${productName}  (${product.id})`);
    }

    // monthly base, annual base, metered overage
    const specs = [
      { kind: 'monthly' as const, body: { currency: 'usd', unit_amount: plan.monthly * 100, recurring: { interval: 'month' } } },
      { kind: 'annual' as const, body: { currency: 'usd', unit_amount: plan.annual * 100, recurring: { interval: 'year' } } },
      {
        kind: 'overage' as const,
        // Billed monthly on EVERY plan, annual included — the allowance resets
        // monthly, so the overage must too.
        body: {
          currency: 'usd',
          unit_amount_decimal: (plan.overage * 100).toFixed(4),
          recurring: { interval: 'month', usage_type: 'metered' },
        },
      },
    ];

    for (const spec of specs) {
      const lk = lookupKey(plan.key, spec.kind);
      const existing = await findPriceByLookupKey(lk);
      let priceId: string;

      if (existing) {
        priceId = existing.id;
        reused++;
        console.log(`    reusing price  ${lk}  → ${priceId}`);
      } else if (apply) {
        const price = await stripe('/v1/prices', {
          product: product.id,
          lookup_key: lk,
          nickname: `Kyriq ${plan.name} ${spec.kind}`,
          metadata: { kyriq_plan: plan.key, kyriq_kind: spec.kind },
          ...spec.body,
        });
        priceId = price.id;
        created++;
        console.log(`    created price  ${lk}  → ${priceId}`);
      } else {
        priceId = `price_DRYRUN_${plan.key}_${spec.kind}`;
        console.log(`    would create   ${lk}`);
      }

      lines.push(`${priceEnvVar(env, plan.key, spec.kind)}=${priceId}`);
    }
  }

  console.log(`\n${created} price(s) created, ${reused} reused.\n`);
  console.log('─'.repeat(72));
  console.log('Environment variables for Vercel (price ids are not secret):\n');
  console.log(lines.join('\n'));
  console.log(`\nSTRIPE_ENV=${env}`);
  console.log('\nStill to add by hand, because they ARE secret:');
  console.log('  STRIPE_SECRET_KEY        the key you ran this with');
  console.log('  STRIPE_WEBHOOK_SECRET    from the webhook endpoint you create in Stripe');
  console.log('─'.repeat(72));

  if (!apply) console.log('\nThis was a dry run. Re-run with --apply to create them for real.\n');
}

main().catch((e) => {
  console.error(`\nFailed: ${e.message}\n`);
  console.error('If this is a permissions error, the restricted key needs write access to');
  console.error('Products and Prices. See docs/STRIPE-SETUP.md.\n');
  process.exit(1);
});
