/**
 * Create the Stripe products and prices Kyriq needs, then print the environment
 * variables to paste into Vercel.
 *
 *   cd frontend
 *   npx tsx scripts/provision-stripe.ts
 *
 * It asks for the key and hides what you type. Nothing is echoed, nothing is
 * written to shell history, and nothing is saved. That is the whole reason it
 * prompts rather than taking the key on the command line.
 *
 * STRIPE_SECRET_KEY in the environment still works, for CI.
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

import { PLANS, priceEnvVar, type PlanKey, type StripeEnv } from '../lib/billing/plans';
import { stripeEnvFromKey } from '../lib/billing/stripe';

const API = 'https://api.stripe.com';

const apply = process.argv.includes('--apply');

/**
 * Ask for the key, with the typing hidden.
 *
 * The script prompts rather than only reading the environment because every
 * other route puts the key somewhere it persists: a shell one-liner lands in
 * PowerShell's history file, and `Read-Host` is easy to misuse by passing the
 * key as the prompt text instead of typing it at the prompt — which silently
 * sets the variable to an empty string. Nothing typed here is echoed or stored.
 */
function promptForKey(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(new Error('STRIPE_SECRET_KEY is not set and there is no terminal to ask on.'));
      return;
    }
    process.stdout.write('Stripe secret key (input hidden): ');

    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let buf = '';
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(buf.trim());
          return;
        }
        if (c === '\u0003') {           // Ctrl-C
          stdin.setRawMode(false);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1);
        else if (c >= ' ') buf += c;
      }
    };
    stdin.on('data', onData);
  });
}

/**
 * Both are assigned by resolveKey() before anything else runs. They cannot be
 * `const` at module scope because tsx compiles this to CommonJS, where
 * top-level await is unavailable, so the prompt has to happen inside main().
 */
let secretKey!: string;
let env!: StripeEnv;

async function resolveKey(): Promise<void> {
  secretKey = (process.env.STRIPE_SECRET_KEY || '').trim() || (await promptForKey());

  if (!secretKey) {
    console.error('\nNo key entered.\n');
    process.exit(1);
  }

  const derived = stripeEnvFromKey(secretKey);
  if (!derived) {
    console.error('\nThat is not a recognisable Stripe key. Expected sk_test_, sk_live_, rk_test_ or rk_live_.\n');
    process.exit(1);
  }
  env = derived;
}

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
  const verb = body ? method : 'GET';
  const res = await fetch(`${API}${path}`, {
    method: verb,
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
    throw new Error(`${verb} ${path} -> ${msg}`);
  }
  return json;
}

/**
 * Stable, human-readable, unique per plan+kind+env+AMOUNT. The amount is in
 * the key so a price change creates a new Stripe price. Prices are immutable,
 * and a key without the amount would silently reuse the old price.
 */
function lookupKey(plan: PlanKey, kind: 'monthly' | 'annual' | 'overage', amount: number): string {
  const cents = Math.round(amount * 100);
  return `kyriq_${env}_${plan}_${kind}_${cents}c`;
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
  await resolveKey();

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
      const amount = spec.kind === 'monthly' ? plan.monthly : spec.kind === 'annual' ? plan.annual : plan.overage;
      const lk = lookupKey(plan.key, spec.kind, amount);
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
