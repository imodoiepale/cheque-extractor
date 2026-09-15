# Prototype v12 review (kyriq-developer-handoff-v12-final)

Reviewed 2026-09-15 against the live app in `frontend/`.

## What the handoff actually is

- 15 static app pages + a marketing page + a login page. One shared stylesheet, one 29-line `app.js`.
- Nothing is stateful. Every button that would do work opens the same generic "Interactive prototype" modal. 39 such placeholder actions in total.
- No check image is displayed anywhere. The side-by-side review screen is referenced by three buttons but was never built.
- No role switching. Firm Admin and Super Admin links render for everyone.
- Treat it as a navigation and information-architecture spec, not code to reuse.

## Page-by-page: prototype vs current app

| Prototype page | What it shows | Current app equivalent | Verdict |
|---|---|---|---|
| index (login) | Email/password, demo creds | `/login`, `/signup` (plan picker, 14-day trial badge) | Keep ours. Add the left-hand "1-2-3-4" story panel from the prototype. |
| upload | Dropzone, current-batch list, "Continue to Match" | `/upload` 3-step stepper (Upload → Preview → Configure & Extract) with engine choice, page/cheque range, force re-run, live progress | Ours is far richer. Fold it into "Step 1" of the new flow. Keep Preview + engine choice as an "Advanced" disclosure, not a separate step. |
| match | 4 KPI tiles, "Matching rules" text, "Open Review Queue" | `/process/[id]` (5-stage pipeline, live log) + `POST /api/matches/sync-qb` | This is a processing state, not a user action. Make it auto-advance to Review when the job finishes. |
| reconcile ("Match & Review") | KPI tiles, 3 tabs (Needs Attention / 100% Matches / All), table with score ring + issues + Review/Resolve | `/qb-match` (7 status tabs, sort, select-all, Approve, Remap, Resolve, Flag, Note, Edit QB, Create in QB, Undo, confidence breakdown) | Ours has every action the prototype hints at and more. Adopt the prototype's 3-tab grouping and the "Issues" column; keep our row actions. |
| matched (100% Matches) | List of exact matches, "Approve All 391" | `/qb-match` Matched tab + "Auto-Approve ≥95%" | Already exists. Just becomes a tab. |
| all-checks | Full batch table | `/qb-match` All tab, `/qb-comparisons` table | Already exists. |
| approve ("Approve & Clear") | Batch summary, pre-flight checklist, one "Approve & Clear in QuickBooks" button | Approve per row (`/qb-match`) or per check (`DetailModal` Approve & Clear); Chrome extension clears in QBO | New page worth building. Wraps existing `bulk-approve` + `clear-transaction` with a server-side validation pass and a batch record. |
| history | Batch table (batch id, company, checks, matched, approved by, status) | `/dashboard` documents list (per PDF, no approval info) | New. Needs a `batches` concept in the DB. |
| reports | 4 KPIs, fake weekly bar chart, match quality | `/analytics` (engine breakdown) + `/firm-dashboard` (match-rate chart) | Merge our two pages into one Reports page with the prototype's KPIs. |
| companies | Company table, Add Company, Reconnect | `CompanySwitcher` in sidebar backed by `qb_connections` | Data exists. Page is new but thin. |
| connections | QBO list + 6-step connection flow + connect modal | `/settings` Integrations tab (connect, diagnose, explore, pull, .QBO import) | Prototype UX is clearer. Move our connect/reconnect here; keep diagnostics and .QBO import as a sub-section. |
| users | User table, Invite User | `/settings/team` page exists but is unlinked and its 3 APIs do not exist | Build the missing team APIs + roles migration. |
| settings | Matching preferences (5 fields) + link to Connections | `/settings` General tab (two unwired export controls) | See "Matching preferences" below. |
| billing | Plan / included / used, usage bar, Manage Plan | `/billing` is an API-cost report, no Stripe anywhere | Stripe is a net-new build: checkout, webhooks, portal, usage meter, trial cap. |
| firm-admin | 4 KPIs, work-needing-attention, team activity | `/firm-dashboard` (per-PDF "clients", simulated matching) | Rebuild on real batch + match data. |
| super-admin | 4 KPIs, platform health, 4 shortcuts | `/admin` (Overview, Accounts, Revenue, Users, tenant detail) | Ours is more complete. Keep. |
| website | Hero, 4-step, 3 pricing tiers | `/` landing page | Copy and pricing need reconciling (see below). |

## Things the current app has that the prototype drops

Ajay said the current build "has some more options than what the prototype shows". These are the ones to make sure survive a redesign:

- Extraction engine choice (Tesseract / NuMarkdown / Gemini / Hybrid), page and cheque ranges, re-extract, per-field confidence, MICR data.
- Remap to a different QB transaction, Resolve discrepancy (use check amount / use QB amount / override), Create in QB, Edit QB date/ref/memo in place, Undo approval, Flag with preset reasons, internal notes.
- Fix All Discrepancies (bulk push to QuickBooks) on `/qb-comparisons`.
- Vouching (mark a check as verified without a QB match).
- .QBO / .OFX / .QFX bank-file import as a no-QuickBooks-subscription path.
- Export to CSV, IIF, QBO CSV, Xero, Zoho, Sage.
- QB diagnostics and 14-entity data explorer.
- Chrome extension that clears transactions inside QuickBooks.

## Inconsistencies inside the prototype

- Pricing tier at $497 is called "Growth" on billing.html and "Firm" on website.html.
- upload.html marks step 1 as current but captions steps 1 and 2 "Completed".
- Stepper links are unguarded. You can click "4 Approve" from Upload.
- History filters/export and Reports have no working controls and no filters at all.
- Overage pricing is never stated. Only "a re-uploaded check counts again".
- No profile, password, MFA, notification, or retention settings anywhere.
- Trial is "two weeks, 200 checks, no card" on the website. The app has no trial machinery.

## Current-app problems the redesign should fix at the same time

- Two competing match engines with different scoring: `lib/matching-algorithm.ts` (40/30/15/15) and `qb-comparisons/utils/comparisonUtils.ts` (40/30/20/10). Pick one.
- Plan prices disagree: signup and landing say 29/59/99, admin revenue says 49/129/299, prototype says 147/497/997.
- `/reconciliation`, `/super-admin`, `/review/[id]`, `/settings/team`, `/admin/users` are unreachable from any nav.
- Role model is a hardcoded super-admin email list. No firm-admin or member roles exist in the DB or RLS.
- `/firm-dashboard` "clients" are PDFs, and its matching is simulated from OCR confidence, not real QB matches.

## The 1-2-3-4 stepper (Ajay's question)

Keep it. It is the best idea in the prototype and the current app lacks any single path through the work.

Changes to make it work for real:

1. Drive step state from the batch record, not from which page you are on. Step 3 should not show "In Progress" until matching has actually run.
2. Gate forward clicks. Approve is disabled until Review has zero unresolved rows, or the user explicitly excludes them.
3. Make step 2 (Match) a progress screen that auto-advances. The user only ever acts on three steps: Upload, Review, Approve.
4. Put the stepper on one route (`/reconcile`) with the step in the URL, instead of four HTML pages. That keeps company/account context and batch id in one place.

For "jump right in after subscribing or starting the trial": land new users directly on `/reconcile` step 1. If there is no QuickBooks connection, step 1 shows an inline "Connect QuickBooks" card above the dropzone instead of sending them to Connections. That collapses onboarding into the same four steps they will use every day. No separate checklist or wizard is needed.

## Matching preferences under Settings (Ajay's question)

Agree it does not belong there. Today those thresholds are hardcoded in `lib/matching-algorithm.ts` and nobody has asked to change them.

Recommendation: delete the Settings panel. Keep exactly one user-facing control, the auto-approve threshold, and put it next to the "Approve All" button on the Review step where it is used. Amount and date tolerance can stay as code constants until a customer asks. If a per-company override is ever needed it belongs on the Company page, not global settings.

## Effort to reach the prototype (for pricing)

Rough developer days. Backend OCR and QB integration do not need rebuilding; this is mostly frontend restructuring plus three net-new subsystems (roles, batches, Stripe).

| Area | Days |
|---|---|
| New shell, nav, single `/reconcile` route with real stepper, wired to existing sync + match APIs | 5–8 |
| Consolidate qb-match and qb-comparisons into one Review step (one scorer, one table, keep all row actions) | 4–6 |
| Side-by-side review modal with check image (adapt existing DetailModal) | 2–3 |
| Approve & Clear step: batch record, server-side validation, bulk clear, audit entries | 3–4 |
| Companies + Connections pages on top of `qb_connections` | 3–4 |
| Roles (user / firm admin / super admin): migration, RLS, invite flow, the three missing team APIs, nav gating | 5–8 |
| Stripe: checkout, webhooks, customer portal, usage metering, trial cap of 200 checks | 5–8 |
| History + Reports (needs batches table; merge analytics + firm-dashboard charts) | 3–5 |
| Firm Admin dashboard on real data | 2–3 |
| Marketing site copy/pricing alignment | 2–3 |
| QA, responsive pass, cleanup of dead routes | 3–5 |
| **Total** | **37–57** |

Sequencing suggestion: shell + reconcile flow + review consolidation first (the daily-use path), then roles and companies, then Stripe and history/reports last. Ajay can review pages in that order too.
