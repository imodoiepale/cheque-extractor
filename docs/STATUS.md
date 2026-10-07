# Kyriq delivery status

As at 7 October 2026.

Verified against the repository and the open pull request, not against checkbox state. Where I could
not confirm something, it says so rather than claiming it is done.

---

## Short version

The build is substantially complete. Nearly all of the application work described in the v17 handoff,
the email specification and the Stripe billing requirements now exists in code, on one pull request.

It cannot run yet. **Eleven database migrations have never been applied**, so most of the new
functionality is written against tables that do not exist in the live database. That is the single
item standing between here and a working pilot, and it takes minutes rather than days.

Everything else outstanding falls into three groups: account and DNS setup that only you or Michael
can do, two items blocked on assets that never arrived, and a verification pass that has not been run.

---

## Where the work lives

| | |
|---|---|
| Pull request | [#1](https://github.com/imodoiepale/cheque-extractor/pull/1), open and ready for review |
| Branch | `feat/v2-glass-redesign-trial-and-roles` into `main` |
| Size | 37 commits, 729 files, roughly 166,000 lines added |
| Frontend build | Passing on Vercel |
| Backend check | Failing, explained below under "Known noise" |

Documentation already on `main`: the build checklist, the design system, the email specification
review and the client proposal addendum.

---

## Built and verified

Each line below was confirmed by reading the files on the branch.

**Security and access.** The QuickBooks OAuth state is now signed, closing a hole where a crafted
request could attach a customer's QuickBooks company to another firm. The extension configuration
endpoint no longer serves secrets to unauthenticated callers, and its web-accessible resources were
narrowed. An anon-readable settings table was closed. Roles, team management and multi-factor
authentication are in.

**The reconciliation workflow.** A single `/reconcile` route with a real stepper driven by a batch
record, a Match step that advances by itself, a Review step merging the old QB Match and QB
Comparisons screens into three tabs, a side-by-side comparison modal, a resume card for interrupted
work, and a Connect QuickBooks card inline on step one.

**Billing.** Around 4,250 lines covering checkout, a 400-line webhook handler, subscription
management, plan changes, cancellation, reactivation, renewal reminders, usage reporting, annual
subscriptions and admin-authorised refunds.

**Email.** Sending through Resend with a template set, a notices endpoint, preferences, and an
unsubscribe route. QuickBooks connection health tracking, which the connection emails depend on.

**Usage and trials.** An immutable usage ledger, upload fingerprinting, trial enforcement, and
complimentary account grants so pilot firms can be let in without paying.

**Interface.** The premium glass design system across all nine work parcels: shells and navigation,
upload, dashboard and process, the reconciliation grid, settings and the authentication pages, admin
surfaces with charts on one palette, QuickBooks integration screens, and the landing and legal pages.
History and reports pages, with retention sweeping.

**Housekeeping found along the way.** Eleven drifted copies of the QuickBooks token refresh were
replaced with one resolver. Several silent failures were caught and fixed, including glass surfaces
that were not actually blurring, four shadow utilities that never rendered, and a class of theme
overrides that did nothing.

---

## The blocker

**Migrations 026 through 036 have not been applied to Supabase.**

They carry the trial clock and billing period, the usage ledger, upload fingerprints, complimentary
grants, roles and multi-factor authentication, the anon-read fix, the batches table, Stripe billing,
email and QuickBooks health, history and retention, and the QuickBooks accounts table.

The checklist records 026 to 031 as unapplied and re-checked on 6 October. Migrations 032 to 036 were
written after that date, so they are in the same state.

Until these run, the reconciliation stepper, billing, email, history, trials and the switchers all
reference tables that are not there. Applying them is the first thing to do, and everything else in
this document is downstream of it.

---

## Outstanding, grouped by who can act

### Needs you or Michael, not code

- Apply migrations 026 to 036 to Supabase.
- Set `REQUIRE_AUTH=true` on the Railway backend.
- Point Supabase at Resend for custom SMTP, and correct the site URL. Without this, password reset
  email runs through a shared sender limited to a handful of messages an hour.
- Add SPF, DKIM and DMARC records for `updates.kyriq.com`.
- Create the Stripe products and prices in Test and Live, and put the IDs into environment variables
  per environment.
- Google Workspace domain verification, and verify `kyriq.com` in Search Console for the Chrome
  listing.
- Confirm the Intuit app sits under Michael's account with production keys. Worth checking the API
  read volume against the free tier's 500,000 monthly reads, because it blocks rather than bills when
  exceeded, which would stop every customer's sync at once.

### Blocked on things that never arrived

- **The logo files.** The brand colours are applied throughout, Indigo `#6366f1` and Emerald
  `#10b981`, but the logo pack itself was never added to the repository. The extension icon sizes
  depend on it too.
- **The 15-question FAQ.** The section and its styling exist on the website with the content
  deliberately left empty, waiting on Michael's final copy.

### Still real work

- **Chrome extension.** A commit claims it matches the application, but this has not been checked by
  hand against a QuickBooks register, and the checklist still shows five open items against it. Treat
  as unverified.
- **The auto-approve threshold has no home in the interface.** The matching preferences panel was
  removed from Settings as Michael asked, but the one control that was meant to survive was never
  placed next to the Approve All button.
- **Per-page checkboxes** for bank statement pages, replacing the current contiguous range selector.
- **One trial per QuickBooks company**, to stop someone opening repeat free trials with new email
  addresses.
- **The trial meter**, showing days and checks remaining inside the app.

### Verification, none of it run

- The Stripe acceptance list from the billing requirements, in Test Mode.
- The role matrix as User, Administrator and Super Admin, checked by calling the endpoints directly
  rather than by looking at the menu.
- An anon-key request returning zero rows against every new table.
- The extension tested by hand on a QuickBooks sandbox.
- A responsive pass at 1440px and 400px.
- Type check, lint and production build.

---

## Known noise

The pull request shows one failing check, "Vercel – cheque-extractor-backend". The Python backend
runs on Railway and is configured for it. There is no Vercel configuration for the backend in the
repository. The failing check comes from a stray Vercel project pointed at this repository that
should be disconnected or deleted in the Vercel dashboard. The frontend deployment passes.

---

## A note on the checklist

`CHECKLIST.md` understates what is finished. It records 69 done against 74 open, but the last nine
commits landed after it was last updated, so sections 3, 4, 9 and 13 appear open while being built in
code. I have deliberately not edited it, because another session may be working on that branch and an
edit now would conflict. This document is the accurate picture; the checklist should be reconciled
once the branch is quiet.
