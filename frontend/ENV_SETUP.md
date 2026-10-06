# Environment Variables Setup Guide

## Required Environment Variables for Production

Create a `.env.local` file in the `frontend` directory with the following variables:

---

## 🔐 Supabase Configuration

```env
# Supabase URL (from Supabase Dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co

# Supabase Anon/Public Key (from Supabase Dashboard → Settings → API)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase Service Role Key (from Supabase Dashboard → Settings → API)
# ⚠️ NEVER expose this in client-side code - only use in API routes
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Where to find:**
1. Go to https://app.supabase.com
2. Select your project
3. Go to Settings → API
4. Copy the values

---

## 🔗 QuickBooks OAuth Configuration

```env
# QuickBooks Client ID (from Intuit Developer Portal)
QUICKBOOKS_CLIENT_ID=ABT11UEvWZetoyA6wIAVI6fTc3PmCGod6B8IcDGRzCZ6nX2JBM

# QuickBooks Client Secret (from Intuit Developer Portal)
QUICKBOOKS_CLIENT_SECRET=your-client-secret-here

# QuickBooks Redirect URI (must match Intuit Developer Portal exactly)
# Development:
QUICKBOOKS_REDIRECT_URI=http://localhost:3080/api/qbo/callback
# Production:
# QUICKBOOKS_REDIRECT_URI=https://check-extractor-frontend.vercel.app/api/qbo/callback
```

**Where to find:**
1. Go to https://developer.intuit.com/app/developer/myapps
2. Click on your app
3. Go to "Keys & OAuth" tab
4. Copy Client ID and Client Secret
5. Ensure Redirect URI matches your configuration

---

## 🌐 Application URL

```env
# Your application's base URL
# Development:
NEXT_PUBLIC_APP_URL=http://localhost:3080
# Production:
# NEXT_PUBLIC_APP_URL=https://check-extractor-frontend.vercel.app
```

---

## 🤖 Google Gemini AI (OCR Processing)

```env
# Google Gemini API Key (for OCR processing)
GEMINI_API_KEY=your-gemini-api-key-here
```

**Where to find:**
1. Go to https://makersuite.google.com/app/apikey
2. Create a new API key
3. Copy the key

---

## 📝 Complete .env.local Template

```env
# ============================================
# SUPABASE CONFIGURATION
# ============================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# ============================================
# QUICKBOOKS OAUTH
# ============================================
QUICKBOOKS_CLIENT_ID=ABT11UEvWZetoyA6wIAVI6fTc3PmCGod6B8IcDGRzCZ6nX2JBM
QUICKBOOKS_CLIENT_SECRET=your-client-secret-here
QUICKBOOKS_REDIRECT_URI=http://localhost:3080/api/qbo/callback

# ============================================
# APPLICATION CONFIGURATION
# ============================================
NEXT_PUBLIC_APP_URL=http://localhost:3080

# ============================================
# AI/OCR SERVICES
# ============================================
GEMINI_API_KEY=your-gemini-api-key-here
```

---

## 🚀 Production Environment Variables (Vercel)

When deploying to Vercel, add these environment variables in:
**Vercel Dashboard → Your Project → Settings → Environment Variables**

### Production Values:

```env
# Supabase (same as development)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# QuickBooks (PRODUCTION KEYS)
QUICKBOOKS_CLIENT_ID=your-production-client-id
QUICKBOOKS_CLIENT_SECRET=your-production-client-secret
QUICKBOOKS_REDIRECT_URI=https://check-extractor-frontend.vercel.app/api/qbo/callback

# Application URL (Production)
NEXT_PUBLIC_APP_URL=https://check-extractor-frontend.vercel.app

# Google Gemini (same as development)
GEMINI_API_KEY=your-gemini-api-key-here
```

---

## ⚠️ Security Best Practices

1. **Never commit `.env.local` to Git** - it's already in `.gitignore`
2. **Never expose `SUPABASE_SERVICE_KEY` in client-side code** - only use in API routes
3. **Use different QuickBooks keys for development and production**
4. **Rotate API keys regularly**
5. **Use environment-specific values** (localhost for dev, production URL for prod)

---

## ✅ Verification Checklist

After setting up environment variables:

- [ ] `.env.local` file created in `frontend` directory
- [ ] All Supabase variables set correctly
- [ ] QuickBooks credentials configured
- [ ] Redirect URI matches Intuit Developer Portal exactly
- [ ] Application URL is correct for environment
- [ ] Gemini API key is valid
- [ ] No syntax errors in `.env.local` (no quotes around values)
- [ ] Server restarted after adding variables

---

## 🧪 Testing Environment Variables

Run this command to verify environment variables are loaded:

```bash
# In frontend directory
npm run dev

# Check console for any missing env var warnings
```

Test Supabase connection:
```bash
# Should show your Supabase URL
echo $NEXT_PUBLIC_SUPABASE_URL
```

---

## 🔧 Troubleshooting

**Issue: "NEXT_PUBLIC_SUPABASE_URL is not defined"**
- Solution: Restart your dev server after creating `.env.local`

**Issue: QuickBooks OAuth fails**
- Solution: Verify `QUICKBOOKS_REDIRECT_URI` matches Intuit portal exactly (including protocol)

**Issue: Supabase auth not working**
- Solution: Check that `NEXT_PUBLIC_SUPABASE_ANON_KEY` is the anon key, not service key

**Issue: Environment variables not loading in Vercel**
- Solution: Ensure variables are added in Vercel Dashboard, then redeploy

---

## 📚 Additional Resources

- **Supabase Docs:** https://supabase.com/docs/guides/getting-started
- **QuickBooks OAuth:** https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0
- **Vercel Environment Variables:** https://vercel.com/docs/concepts/projects/environment-variables
- **Next.js Environment Variables:** https://nextjs.org/docs/app/building-your-application/configuring/environment-variables

---

**Last Updated:** March 2, 2026  
**Status:** Production Ready

---

## 💳 Stripe billing (CHECKLIST section 7)

None of these are set in this repo. With them absent, every billing endpoint
answers `503 stripe_not_configured` with the list of what is missing, and the
billing page keeps showing payment status, paid-through date, payment method and
the plan controls as *pending* rather than rendering blanks. That is the intended
behaviour, not a bug to work around.

```bash
# Keys. The ENVIRONMENT IS DERIVED FROM THE SECRET KEY (sk_test_ / sk_live_), so
# a mislabelled STRIPE_ENV cannot point live keys at test prices — the
# integration reports itself unconfigured instead of guessing.
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...          # Stripe CLI or the dashboard endpoint
STRIPE_ENV=test                          # optional; must agree with the key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...   # only if Elements is added later

# Price ids — nine per environment, never hardcoded in source.
# Pattern: STRIPE_PRICE_<TEST|LIVE>_<PLAN>_<MONTHLY|ANNUAL|OVERAGE>
# OVERAGE is the metered per-cheque price and is billed MONTHLY on every plan,
# including annual ones.
STRIPE_PRICE_TEST_ESSENTIAL_MONTHLY=price_...      # $147/mo,   1,200 cheques
STRIPE_PRICE_TEST_ESSENTIAL_ANNUAL=price_...       # $1,617/yr
STRIPE_PRICE_TEST_ESSENTIAL_OVERAGE=price_...      # $0.15 per cheque
STRIPE_PRICE_TEST_PROFESSIONAL_MONTHLY=price_...   # $497/mo,   4,500 cheques
STRIPE_PRICE_TEST_PROFESSIONAL_ANNUAL=price_...    # $5,467/yr
STRIPE_PRICE_TEST_PROFESSIONAL_OVERAGE=price_...   # $0.12 per cheque
STRIPE_PRICE_TEST_SCALE_MONTHLY=price_...          # $997/mo,  10,000 cheques
STRIPE_PRICE_TEST_SCALE_ANNUAL=price_...           # $10,967/yr
STRIPE_PRICE_TEST_SCALE_OVERAGE=price_...          # $0.10 per cheque
# ... and the nine STRIPE_PRICE_LIVE_* equivalents.

# Metered usage. Must match the meter's event_name in the Stripe dashboard.
STRIPE_METER_EVENT_NAME=kyriq_checks_processed

# Cron endpoints: POST /api/billing/report-usage and
# POST /api/billing/renewal-reminders, sent as `Authorization: Bearer <secret>`.
# An UNSET secret denies every caller — these endpoints move money.
BILLING_CRON_SECRET=<random 32+ chars>

# Annual billing is BUILT BUT UNVERIFIED. An annual base plus a monthly metered
# overage is a mixed-interval subscription, and it has never been exercised
# against a real Stripe account. Leave this unset until the first annual
# subscription has been confirmed in the Stripe dashboard; while unset, the
# annual endpoints answer 501 and say why.
STRIPE_ANNUAL_ENABLED=false
```

**Webhook endpoint:** `POST /api/billing/webhook`, subscribed to exactly eight
events — `checkout.session.completed`, `customer.subscription.created`,
`.updated`, `.deleted`, `invoice.created`, `invoice.finalized`, `invoice.paid`,
`invoice.payment_failed`. Paid access is applied **only** from this verified
endpoint; the Checkout return URL says `checkout=confirming` and grants nothing.

**Self-check:** `npx tsx scripts/check-stripe-billing.ts`
