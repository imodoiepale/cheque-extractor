# Stripe and Vercel setup

Everything needed to take Kyriq live on billing, in the order it has to happen.

---

## 0. First, roll the key that was shared in chat

A `rk_live_` key was pasted into a chat transcript. Treat it as compromised and roll it:
Stripe dashboard → Developers → API keys → find the restricted key → **Roll key**.

It is a live key, so anyone holding it can act on the real account within its permissions. Rolling
takes seconds and invalidates the old one.

The publishable key (`pk_live_`) does not need rolling. It is public by design and appears in page
source on any Stripe site. **Kyriq does not currently use it at all** — the integration uses hosted
Stripe Checkout, so there is no client-side Stripe.js. Do not add it as an environment variable;
an unused secret-looking value is just one more thing to get wrong later.

---

## 1. Restricted key permissions

The app calls these Stripe endpoints, so the restricted key needs **write** on each:

| Resource | Why |
|---|---|
| Products, Prices | Creating the catalogue (the provisioning script) |
| Customers | One Stripe customer per firm |
| Checkout Sessions | Monthly plan purchase |
| Subscriptions | Annual plans, plan changes, cancellation, reactivation |
| SetupIntents | Collecting a card for the annual flow |
| Invoices | Plan-change previews and the invoice list |
| Billing Meters / Meter events | Reporting cheque usage for overage |
| Refunds | Super Admin refunds |
| Webhook endpoints | Read is enough, unless you create the endpoint via API |

If a permission is missing, the call fails with a clear Stripe message naming it. The provisioning
script surfaces that rather than swallowing it.

---

## 2. Create the products and prices

Nine prices: three plans, each with monthly base, annual base and a metered overage price. Doing
this by hand in the dashboard is how a price id ends up on the wrong plan, and that failure is
silent — the customer is simply charged the wrong amount.

```bash
cd frontend
STRIPE_SECRET_KEY=rk_live_... npx tsx scripts/provision-stripe.ts
```

That is a **dry run**. It prints what it would create. Read it, then:

```bash
STRIPE_SECRET_KEY=rk_live_... npx tsx scripts/provision-stripe.ts --apply
```

It is idempotent. Every price carries a `lookup_key`, so re-running reuses what exists rather than
creating duplicates, and a partial failure can simply be re-run.

The figures come from `frontend/lib/billing/plans.ts`, the same module the app and the pricing page
read, so what you create cannot disagree with what the customer was shown:

| Plan | Monthly | Annual | Included cheques | Overage |
|---|---|---|---|---|
| Essential | $147 | $1,617 | 1,200 | $0.15 |
| Professional | $497 | $5,467 | 4,500 | $0.12 |
| Scale | $997 | $10,967 | 10,000 | $0.10 |

The script prints the nine environment variable lines at the end. **Price ids are not secret** —
they appear in checkout URLs — so those lines are safe to paste anywhere.

---

## 3. Create the webhook endpoint

Stripe dashboard → Developers → Webhooks → Add endpoint.

- **URL:** `https://kyriq.com/api/billing/webhook`
- **Events:** exactly these eight, which is what the handler switches on:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.created`
  - `invoice.finalized`
  - `invoice.paid`
  - `invoice.payment_failed`

Copy the signing secret (`whsec_...`) — that is `STRIPE_WEBHOOK_SECRET`.

The handler verifies the signature **before** parsing the body, and is idempotent via a primary key
on the event id, so Stripe's retries cannot double-apply. Paid access is granted only from a
verified webhook, never from the success redirect.

---

## 4. Which Vercel project

You have two Vercel scopes, and this matters because only one of them is production:

| Scope | Project | URL | What it is |
|---|---|---|---|
| **Kyriq** (pro) | `kyriq` | kyriq.com | **Production. This is the one.** |
| Kyriq (pro) | `cheque-extractor` | …vercel.app | Older, superseded by `kyriq` |
| imodoiepale (hobby) | `cheque-extractor-frontend` | …vercel.app | Your personal copy |
| imodoiepale (hobby) | `cheque-extractor-backend` | …vercel.app | **Delete this one** |

**Delete `cheque-extractor-backend`.** The Python backend runs on Railway and has no Vercel config
in this repo, so that project only ever produces a failing check on every pull request. It is the
red mark you have been seeing.

Also worth deciding: `cheque-extractor` in the Kyriq team and `cheque-extractor-frontend` in your
personal account are both stale copies of the same app. Leaving them deployed means three live URLs
serving Kyriq, two of them unmaintained and pointing at the same database. Archive or delete them.

---

## 5. Environment variables

Already set on `kyriq` (production): Supabase (3), QuickBooks and Intuit (6), and the URL set (4).

**To add.** Price ids come from the script; the two secrets you paste yourself.

```
STRIPE_ENV=live
STRIPE_SECRET_KEY=<the restricted key, after rolling it>
STRIPE_WEBHOOK_SECRET=<whsec_... from step 3>

STRIPE_PRICE_LIVE_ESSENTIAL_MONTHLY=<from script>
STRIPE_PRICE_LIVE_ESSENTIAL_ANNUAL=<from script>
STRIPE_PRICE_LIVE_ESSENTIAL_OVERAGE=<from script>
STRIPE_PRICE_LIVE_PROFESSIONAL_MONTHLY=<from script>
STRIPE_PRICE_LIVE_PROFESSIONAL_ANNUAL=<from script>
STRIPE_PRICE_LIVE_PROFESSIONAL_OVERAGE=<from script>
STRIPE_PRICE_LIVE_SCALE_MONTHLY=<from script>
STRIPE_PRICE_LIVE_SCALE_ANNUAL=<from script>
STRIPE_PRICE_LIVE_SCALE_OVERAGE=<from script>

RESEND_API_KEY=<from Resend>
BILLING_CRON_SECRET=<any long random string you generate>
```

`BILLING_CRON_SECRET` authenticates the scheduled routes (renewal reminders, QuickBooks health
check, retention sweep) so they cannot be triggered by anyone who finds the URL. Generate it with
`openssl rand -hex 32` and never reuse it elsewhere.

`STRIPE_ANNUAL_ENABLED` is deliberately **left unset**. Annual billing is written but has never run
against Stripe, and every annual path answers 501 until you set it. Set it only once you have tested
an annual purchase in Test mode.

To add them:

```bash
cd frontend
npx vercel link --scope michaels-projects-47b10402 --project kyriq
npx vercel env add STRIPE_SECRET_KEY production
```

Each `env add` prompts for the value, so the secret goes from your keyboard to Vercel without
passing through a file, a shell history entry or a chat.

---

## 6. Test before live

Do the whole thing in Test mode first. Use a test key, which makes the script write
`STRIPE_PRICE_TEST_*` variables instead, and point a test webhook at a preview deployment.

The acceptance list is section 14 of `STRIPE-BILLING-REQUIREMENTS.md`. The ones that actually catch
problems: a monthly purchase on each plan, an overage invoice, a failed payment and its recovery,
and a cancellation followed by a reactivation.

Then verify the wiring:

```bash
cd frontend && npx tsx scripts/check-stripe-billing.ts
```

---

## 7. Order of operations

1. Roll the exposed key.
2. Apply the database migrations (`supabase/APPLY_PENDING_MIGRATIONS.sql`) — billing writes to tables that do not exist yet.
3. Run the provisioning script in Test mode, set the test variables, and work through the acceptance list.
4. Repeat in Live mode.
5. Delete the stray `cheque-extractor-backend` Vercel project.

Step 2 is not optional and not reorderable. Stripe will happily take a real payment and the webhook
will then fail to record it, because `billing_invoices` and the rest do not exist yet.
