# Kyriq v2 — progress update

**8 October 2026**

## Where it stands

v2 is built and merged. 112 of the 145 items on our build checklist are done, and what's
left is almost entirely accounts, DNS and sign-off rather than code.

Built and merged:

- **The four-step reconcile flow** you asked to keep — Upload → Match → Review → Approve, as a
  single page with the 1-2-3-4 stepper. Step 2 moves on by itself, so you only ever touch
  Upload, Review and Approve.
- **Continue Reconciliation.** Close Kyriq mid-flow and come back to "ABC Construction LLC ·
  Operating Checking / August 2026 · Step 3 of 4 — 24 checks need attention". No re-uploading,
  no re-approving.
- **Review merged** QB Match and QB Comparisons into one surface with three tabs — Needs
  Attention, 100% Matches, All Checks. Every action from the old pages survived; we checked
  them off one by one. The spreadsheet look is gone, the row density isn't.
- **A premium redesign of the whole app**, matching the look we discussed.
- **Companies, Connections and Users**, with Administrator and User roles enforced on the
  server rather than by hiding menu items, and **MFA** required for Administrators.
- **Free accounts for your pilot firms** — a Super Admin control with an expiry and a reason,
  which overrides the trial so nobody gets cut off mid-test.
- **The trial**: 14 days or 250 processed checks, whichever comes first. Processing stops;
  history stays readable.
- **Stripe billing** — Essential, Professional and Scale, monthly and annual, metered overage,
  and the eight webhooks. Annual is deliberately switched off until we can test it against a
  real Stripe account; see below.
- **Email on Resend** — 19 emails with unsubscribe handling.
- **History and Reports**, and upload retention: source PDFs delete 14 days after a
  reconciliation completes, counted from completion so a paused month keeps its files.
- **Bank statement upload**, the one you called a big deal. Kyriq now filters out the backs of
  cheques and rejects statement pages that only look like cheques.
- **The Chrome extension** restyled to match the app, with the same tabs, and it opens
  QuickBooks to the company you're working on.

## Two things are blocking you from seeing any of it

**1. kyriq.com is pointing at the wrong Vercel project.** The new build deployed successfully,
but to `cheque-extractor-frontend`, while the domain is still attached to the older
`check-extractor-frontend` project. So kyriq.com is serving the previous version — the one with
"Watch demo" and "Trusted by 500+ firms" still on it. Repointing the domain is a two-minute
change in the Vercel dashboard and nothing needs rebuilding.

**2. The database migrations haven't been run.** There are twelve of them, bundled into one file
so they can be pasted into the Supabase SQL editor in a single go. Until they run, the trial,
billing, email, the stepper, History and the switchers have nothing to read from — they report
honestly that they're unavailable rather than showing wrong numbers, but they can't work.

Those two together are the whole gap between "built" and "you can use it". Neither is
development work.

## One security item to action with the migrations

We found a table in the database that was readable by anyone with the app's public key, and it
holds columns for provider keys and QuickBooks tokens. They were empty, so nothing leaked — but
the Settings page writes a key into that exact row, so the first key saved would have become
public. The fix is in the migration bundle and should be applied before anyone saves credentials.

## What we need from you

| | |
|---|---|
| Repoint kyriq.com to the current Vercel project | 2 minutes, dashboard |
| Run the migration bundle in Supabase | one paste, one click |
| Resend DNS — SPF, DKIM, DMARC on `updates.kyriq.com` | no email can send before this |
| Stripe products and prices, Test **and** Live | annual stays off until these exist and we can test it |
| The logo pack | versions 1 and 7 never reached us; the brand colours are already in |
| `kyriq.com` verified in Google Search Console | needed for the Chrome Web Store listing |
| A test login, or run the migrations so we can make a comp account | see below |

## Two things we want to be straight about

**Nobody has used this signed in yet.** Every screen has been checked against the real
stylesheet and measured at desktop and phone widths, and the whole thing builds and passes its
own checks — but we have deliberately not created an account on your production database. Once
the migrations are in we'll make a comp account and go through all of it properly before a firm
does. We'd rather find the rough edges than have your pilot firms find them.

**The annual plan is not finished, and we're not calling it finished.** Annual base plus monthly
overage is an unusual Stripe shape, and we couldn't confirm Stripe accepts it without a real
account. The code is written and switched off; monthly works. We'll turn it on once we can test
it rather than discover the problem on a customer.

## One wording decision for you

The email copy you sent says "check **uploads**". The billing rules and the website both say
"**processed** checks", and that's what the system actually counts — only after a check processes
successfully. We've written every email with "processed", because otherwise an email would
contradict the invoice. That changes your locked copy, so it needs your say-so.

## On the date

Monday 5 October was the date we gave for trials, and that was based on getting the code done. The
code is done. What isn't done is the deployment, and that's now a short, mostly dashboard-side
list. Once the domain is repointed and the migrations run, we want a day to go through the app
properly signed in before any firm touches it. We'll give you a firm date the moment those two
things are cleared — and it's days away, not weeks.
