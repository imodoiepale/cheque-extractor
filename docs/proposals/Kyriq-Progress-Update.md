# Kyriq v2 — progress update

**8 October 2026** · 112 of 145 build items complete

---

## ✅ Done and merged

**The reconcile flow**
- [x] Single Upload → Match → Review → Approve path, with the 1-2-3-4 stepper you asked to keep
- [x] Steps are clickable, but a forward step stays locked until the previous one is genuinely finished — and it says why
- [x] Step 2 (Match) runs and moves on by itself, so you only ever touch Upload, Review and Approve
- [x] **Continue Reconciliation** — "ABC Construction LLC · Operating Checking / August 2026 · Step 3 of 4 — 24 checks need attention". No re-upload, no re-approval
- [x] Connect QuickBooks card sits inline on step 1, so a new user never leaves the flow
- [x] Approve & Clear step with batch summary and server-side validation

**Review**
- [x] QB Match and QB Comparisons merged into one surface: **Needs Attention · 100% Matches · All Checks**
- [x] Every action from the old pages kept — approve, approve anyway, remap, resolve discrepancy, create in QB, edit QB in place, undo, flag, notes, confidence breakdown
- [x] Side-by-side view: cheque image next to the QuickBooks record
- [x] The spreadsheet look is gone; the row density is not
- [x] Up-to-200-record view kept — it was actually missing, the options jumped 100 to 500
- [x] Old QB Match page retired

**Accounts, companies and people**
- [x] Company and account switchers moved to the top bar, with search, status and account counts
- [x] Accounts grouped Bank / Credit Card with last four, sub-type and balance — credit cards were previously invisible
- [x] Administrator and User roles, enforced on the server rather than by hiding menus
- [x] MFA required for Administrators
- [x] Team invitations working — the invite button previously failed silently
- [x] Matching preferences removed from Settings, as you asked; the one control that matters now sits beside Approve All

**Trial and billing**
- [x] 14 days or 250 processed checks, whichever comes first. Processing stops, history stays readable
- [x] **Free accounts for pilot firms** — a Super Admin grant with an expiry and a reason, which overrides the trial so nobody is cut off mid-test
- [x] One trial per QuickBooks company, so a firm cannot restart with a new email
- [x] Usage ledger — counts only after a check processes successfully, retries never double-count, repeat uploads warn you first
- [x] Stripe: Essential / Professional / Scale, monthly, metered overage, eight webhooks
- [x] Billing page showing real figures. It previously invented payment history

**Everything else**
- [x] Premium redesign across the whole app
- [x] 19 emails on Resend, with unsubscribe handling
- [x] History and Reports
- [x] Upload retention — source PDFs delete 14 days after a reconciliation completes
- [x] Bank statement upload — filters out cheque backs, rejects statement pages that only look like cheques
- [x] Chrome extension restyled to match the app, same tabs, and it opens QuickBooks to the company you are working on
- [x] Website — bank statement hero, real pricing, invented social proof removed

---

## 🔴 Blocking you right now — neither is development work

- [ ] **Repoint kyriq.com to the current Vercel project.** The new build deployed fine, but to `cheque-extractor-frontend`, while the domain is still attached to the older `check-extractor-frontend`. **This is why kyriq.com still looks unchanged.** Two minutes in the dashboard, nothing to rebuild
- [ ] **Run the database migrations.** Twelve of them, bundled into one file to paste into the Supabase SQL editor in one go. Until they run, the trial, billing, email, stepper, History and switchers have nothing to read from

---

## 🟠 Needed from you

- [ ] **Resend DNS** — SPF, DKIM and DMARC on `updates.kyriq.com`. No email can send before this
- [ ] **Stripe products and prices**, Test **and** Live. Annual stays off until these exist and we can test it
- [ ] **The logo pack** — versions 1 and 7 never reached us. The brand colours are already in
- [ ] **kyriq.com verified in Google Search Console** — needed for the Chrome Web Store listing
- [ ] **REQUIRE_AUTH=true** on the Railway backend
- [ ] **Confirm the Intuit app** is on your account with production keys

---

## 🟡 Your decisions

- [ ] **"uploads" → "processed" in the email copy.** Your locked copy says "check uploads"; the billing rules and the website say "processed checks", and that is what the system actually counts. We wrote every email with "processed" so an email cannot contradict an invoice — but it changes your copy, so it needs your say-so
- [ ] **Delete the stray `cheque-extractor-backend` Vercel project.** It has no configuration in the repo and fails on every commit. The Python backend runs on Railway. Dashboard-only, so we cannot do it from here

---

## ⚪ Deliberately unfinished, and we are not pretending otherwise

- [ ] **Annual billing is written but switched off.** Annual base plus monthly overage is an unusual Stripe shape, and we could not confirm Stripe accepts it without a real account. Monthly works. We will turn annual on once we can test it, rather than discover the problem on a customer
- [ ] **Nobody has used this signed in.** Every screen has been checked against the real stylesheet and measured at desktop and phone widths, and the whole thing builds and passes its own checks — but we have deliberately not created an account on your production database. Once the migrations are in we will make a comp account and go through all of it properly before a firm does
- [ ] **The 15-question FAQ** is wired and empty, waiting on your copy. We would rather leave the slot blank than invent answers about billing and data handling

---

## 🔒 One security item, to action with the migrations

A table in the database was readable by anyone holding the app's public key, and it holds columns
for provider keys and QuickBooks tokens. They were empty, so nothing leaked — but the Settings
page writes a key into that exact row, so the first key saved would have become public. The fix is
in the migration bundle and should go in before anyone saves credentials.

---

## On the date

Monday 5 October was based on getting the code done. **The code is done.** What is left is the
deployment, and that is now a short, mostly dashboard-side list. Once the domain is repointed and
the migrations run, we want one day to go through the app properly signed in before any firm
touches it. We will give you a firm date the moment those two are cleared — days, not weeks.
