# Kyriq v17 build + premium glass redesign

> **Added this round:** the whole app gets a premium Apple-style glass look matching depthme.app.
> This is not a skin on top of v17 — it replaces the v17 prototype's flat styling. v17 still governs
> *structure* (which pages exist, the stepper, pricing, copy); DepthMe governs *surface*
> (colour, glass, elevation, type, motion). Where they disagree, v17 decides layout and DepthMe decides looks.



## Context

Michael approved going ahead (via Ajay) and asked for v2 built **alongside** the current app and extension, with no screens that must stay up. Trials with real firms are promised for **Monday 5 October 2026** (today). The approved reference is now **handoff v17** (supersedes v12), plus the email specs, a website copy doc, a new logo pack, four screenshots and several AI-generated code files in `new changes/`.

The user asked for one deliverable now: a `CHECKLIST.md` at the repo root capturing everything expected, ordered so the work can start immediately, at a quality bar suitable for paying firms. No code changes in this step.

## Decisions now settled by the client (no longer open)

Sourced from `Kyriq-Developer-Handoff-v17.zip` → `STRIPE-BILLING-REQUIREMENTS.md` and `DEVELOPER-NOTES.md`:

| Topic | Decision |
|---|---|
| Trial | 14 days **or** 250 successfully processed checks, whichever first. No card. Processing disabled at end, history stays viewable. |
| Plans (monthly) | Essential $147 / 1,200 checks / $0.15 overage · Professional $497 / 4,500 / $0.12 (Most Popular) · Scale $997 / 10,000 / $0.10 |
| Plans (annual, one month free) | $1,617 · $5,467 · $10,967. Monthly allowance still resets monthly; overage billed monthly. 12-month commitment, no prorated refund. |
| Counting | Each check counts **after processing succeeds**. Repeat uploads count again. System retries must not double-count (idempotency key). Immutable usage ledger. |
| Duplicate upload | Ajay (30 Sep): warn "uploaded previously on <date>", user opts in to re-upload and be counted. |
| Stripe | Webhooks are source of truth. Annual base + monthly metered overage needs a mixed-interval subscription via Subscriptions API (flexible billing), not plain Checkout. 8 named webhooks. |
| Signup | New `signup.html` flow; public CTAs say "Start Free Trial" and route to signup, not login. |
| Email sender | Resend, `Kyriq <notifications@updates.kyriq.com>`, reply-to `support@kyriq.com`. Resend Pro chosen. |
| Logo | New designer logo; Michael prefers versions 1 and 7. |
| Website | Hold until Michael's new copy (typed + handwritten checks, FAQ) and logo land. Now delivered in `Update website with correct info.docx`. |
| Build mode | v2 alongside v1 with switch-over. |

## Feature requests from the screenshots and chat

- **Remove the Extraction Method choice** from the Configure step and the re-extract dialog. Always run the default engine. Files: `frontend/app/(app)/upload/page.tsx:62` (`EXTRACTION_METHODS`, rendered ~1164), `frontend/app/(app)/dashboard/components/ConfigureExtractionDialog.tsx:191`.
- **Remove "Extraction Engines" and "Live Progress"** panels from the processing page; keep the status card and stepper. File: `frontend/app/(app)/process/[id]/page.tsx:356` and `:398`.
- **MFA** for accounts. None exists today; only legal pages mention it. Supabase Auth supports TOTP natively.
- **Comp / free accounts** for pilot firms for a set period. Super Admin override, logged.
- **Extension matches the app** in look and options. Today the side panel uses QuickBooks green (#2CA01C) while the app uses navy (#1e2235). Needs restyle + new logo.
- **Bank statement upload** promoted as a headline feature (Michael: "a BIG deal"). Detection already works per page; accuracy and per-page selection work outstanding (see `docs/EMAIL-SPEC-REVIEW.md` sibling analysis and prior finding).

## v17 versus v12

Only 4 files changed plus 1 new. The 16 app pages are byte-identical to v12, so the earlier page review stands.

- **New `signup.html`**: first name, last name, firm name, work email, password (min 8), required terms consent, "Create Account and Start Trial". No plan picker. Current `/signup` has a plan picker and min 6 password and no names or consent.
- **website.html**: nav Sign In + Start Free Trial; all CTAs route to signup; plans renamed Essential / Professional / Scale; monthly/annual toggle; overage bullets; annual terms callout.
- **billing.html**: plan name Professional, remaining-checks + overage note, "Plans and overage rates" panel with monthly/annual tabs.
- **styles.css / app.js**: signup classes and the billing-cycle toggle only. No token changes.

## Client's 21-item change list (`Update website with correct info.docx`)

Product changes:
1. Website: link to trial, plans, emails; **remove "watch demo", "trusted by 500+ firms", testimonials**; new pricing copy.
2. **Sign-in button purple** like the website.
3. **Roles: Administrator and User.** Users get no billing, reports or account editing.
4. **Super Admin can grant free accounts** for testers.
5. **Remove the OCR option** and any image settings or confidence levels. Kyriq decides.
6. **Extension opens QuickBooks to the firm the client is working on**, so they watch Kyriq clear each approved item.
7. Four-step flow, smooth transition.
8. **Resume where you left off**: a prominent "Continue Reconciliation" card (company · account · month · step N of 4 · checks needing attention). No re-upload or re-approve.
9. **Remove QB Match page.**
10. **Remove Analytics** (moves into Firm Admin).
11. **QB Comparisons**: adopt the new design but keep current capability (example given: up to 200 records shown). **Lose the "Excel" look.**
12. Renewals on the **same date each month** (anniversary billing, Stripe default).
13. Trial two weeks, 250 checks.

Open questions he asked (need answers in the reply):
- How do I add free test accounts? → Super Admin comp control (item 4).
- Subscribers must have QB; do we still need the file import section? → recommend hide it from customers, keep for super admin diagnostics.
- How to stop people using multiple emails for free trials? → one trial per QuickBooks realm ID, plus email verification and disposable-domain block.
- How many emails do I need? → answered by the spec: one sending address plus support@.
- Auto-delete uploads after 7 or 14 days? → yes, recommend 14 days after the reconciliation is completed, extracted data kept.

## Approved marketing copy lives on the redesign site

`https://kyriq-website-redesign.michael389314.chatgpt.site/website.html` holds the final hero, four-step section, three value cards, pricing with toggle, **15-question FAQ**, CTA band and footer. It leads with **bank statement upload** and **"Typed or handwritten — Kyriq can read both"**. Every plan lists "Kyriq Chrome extension included". `/extension` holds the side-panel design: 475px panel, header with company and account selectors, Sync, QuickBooks-connected status, usage meter; tabs Upload · Match · Review · Approve · History; Needs Attention chips (Lower confidence, Duplicates, Discrepancies, No match); colour-coded cards.

## Brand

Logo pack: font **Cera Round Pro Bold**; colours **Indigo #6366f1**, **Emerald #10b981**. Version 1 is the horizontal wordmark, version 7 the square K icon. The redesign site still uses placeholder purples and greens, so build with the real logo colours, not the prototype's.

## Client code files in `new changes/`: do not merge

| File | Verdict |
|---|---|
| `Kyriq_Extension_background.js` | **Never ship.** Different file, not a newer version. Embeds the Intuit **client secret** in the extension, stores refresh tokens in `chrome.storage`, has no tenant model, and approve only logs instead of clearing. Replacing `chrome-extension/background/service-worker.js` would remove most features. |
| `qb-routes.js` | Express + Prisma; cannot run here. Every table and column name is wrong, scopes by user not tenant, `isExpired` uses the 1-hour access token so every company shows "Needs reconnect" after an hour. |
| `useQBClients.js` | Duplicates `frontend/hooks/useQBConnections.tsx`; keeps the active company in localStorage only, so UI and backend disagree on which company is active; crashes on SSR. |
| `ClientAccountSwitcher.jsx` + `Kyriq_Switcher_Mockup.html` | **Use as the design target.** Top-bar company switcher with search, avatars, per-row disconnect modal, expired/Reconnect state; account switcher grouped Bank / Credit Card with last four and balance. Rebuild as TSX on `useQBConnections`. |

## Security findings in existing code (fix before any pilot firm)

1. **Cross-tenant QuickBooks attach.** `frontend/pages/api/qbo/callback.ts:32-59` decodes `tenant_id` from unsigned base64 `state` and only warns on CSRF mismatch ("Don't fail - just warn"). A crafted state can attach a company to another firm. Fix: sign state (HMAC with a server secret) or store a nonce server-side keyed to the session, and reject on mismatch.
2. Duplicate detection is in-memory only (`backend/api_server.py` ~944), already noted; must become database-backed for the usage ledger.
3. `/api/extension/config` CORS `*` with unauthenticated path, already noted.
4. Backend CORS allowlist `backend/api_server.py:568` names the old `check-extractor-frontend.vercel.app`; the Vercel rename to "Kyriq" changes preview URLs.

## Copy conflicts to settle

- Emails say "check **uploads**"; website, FAQ and Stripe doc say "**processed** checks" and count after success. Stripe doc is authoritative. Email copy needs the word changed, and it is marked locked, so ask.
- Extension currently uses QuickBooks green #2CA01C; app uses navy #1e2235. Both move to the new brand.

---

## The redesign: premium Apple glass, matching depthme.app

### Stack facts that shape the approach

Kyriq runs **Tailwind v3.4.1 with a `tailwind.config.js`**, not Tailwind v4. The house-style rule about `@theme inline` does not apply here. Tokens go in the Tailwind config plus CSS custom properties in `globals.css`.

Already installed and usable, no new dependencies needed: `framer-motion` 12.38, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`.

### Design principles for this build

The look is earned by restraint, not by piling on blur. Rules the agents must follow:

1. **Glass needs something behind it.** A blurred panel over a flat white page looks like a bug. The app shell gets a fixed, subtly animated gradient mesh background; every glass surface sits over that.
2. **One blur tier per depth.** Shell chrome gets the heaviest blur, cards a medium blur, popovers and sheets the heaviest with the most opacity. Never nest two blurred surfaces directly.
3. **Every glass surface carries a top inner highlight.** A 1px translucent light border plus `inset 0 1px 0 rgba(255,255,255,…)` is what reads as glass rather than as grey.
4. **Shadows are soft, large and low-opacity**, layered two deep: a tight contact shadow plus a wide ambient one. No harsh `shadow-md`.
5. **Type is tight and confident.** Display sizes get negative tracking; body stays neutral. SF Pro / `-apple-system` first in the stack with a loaded fallback.
6. **Motion is spring, not linear.** Press states scale down slightly; entrances rise and fade. Everything respects `prefers-reduced-motion`.
7. **Density stays as it is.** The premium look must not cost rows on screen. Tables keep their current row height, scroll inside their own container, and keep one scrollbar.
8. **Numbers get tabular figures.** Money columns in a reconciliation app must align; `font-variant-numeric: tabular-nums` on every amount.
9. **Contrast is non-negotiable.** Glass reduces contrast, so body text sits at full strength over the surface, and every state colour is checked to 4.5:1. This app shows financial data to professionals all day.
10. **Keep the brand.** Indigo `#6366f1` and Emerald `#10b981` from the new logo pack are the accents. The glass is neutral; colour only marks state and action.

### Build order, and why it is sequential at the start

The first parcel is a hard dependency for every other one. Tokens and primitives land first, on one branch, by one agent. Only then do the page agents fan out, each importing the same primitives. Doing it the other way round produces five different glass cards.

**Stage 1, single agent, blocking:** design tokens in `tailwind.config.js` and `globals.css`; the background mesh; and the primitive set (`GlassCard`, `GlassPanel`, `Button` variants, `Input`/`Field`, `Sheet`/`Dialog`, `Tabs`, `Badge`/`Pill`, `Toast`, skeletons, `KpiTile`, table shell). Built with cva so variants are declared once.

**Stage 2, parallel agents, no file overlap:** each owns a disjoint set of routes and restyles them using only Stage 1 primitives. Parcels are sized evenly from the inventory and assigned so no two agents touch the same file. Shared components are off-limits in Stage 2 — if a page needs a primitive change, it reports back rather than editing it.

**Stage 3, single agent:** the Chrome extension. `sidepanel.css` is 1068 lines of plain CSS with QuickBooks green; it gets the same tokens hand-ported, plus `popup.css` and `qbo-overlay.css`. The client requires the extension to match the app.

**Stage 4, single agent:** visual QA. Every route at 1440px and 400px, light and dark, checking contrast, that no page scrolls twice, that reduced-motion is honoured, and that no hardcoded hex survives outside the token file.

### Risks to control

- **Backdrop-filter is expensive.** Many blurred surfaces on one screen drops frame rate, especially on the big comparison tables. Blur the chrome, not every row. Cap the number of simultaneously blurred elements and test on the 428-check batch.
- **Charts and third-party widgets** do not inherit tokens. Recharts needs its colours passed explicitly.
- **The table is the product.** The reconciliation grid must stay fast and legible. Glass goes on the container and header, never on individual rows.

---

## The deliverable: `CHECKLIST.md` at repo root

One file, checkbox items, each with the file(s) it touches, the source that requires it, and an acceptance line. Ordered by tier so work starts at the top. Sections:

### 0. Ground rules (top of file)
- Source of truth order: v17 handoff → redesign site copy → client 21-item list → email specs. Where they conflict, the conflict table decides.
- Build v2 **alongside** v1: new routes behind an env flag (`NEXT_PUBLIC_UI_V2`), v1 untouched until sign-off, then flip default and delete v1 pages in the cleanup pass.
- Every write carries `tenant_id`; check names against `supabase/migrations/`; migrations idempotent; QBO updates sparse; extension actions never fan out.
- Do-not-merge list for the five client code files, with reasons.
- Quality gate per item: `npm run type-check && npm run lint && npm run build` green, manual run in the browser, screenshot at 1440px and 400px.

### 1. P0 — before the first pilot firm logs in
- Fix the OAuth state tenant-attach bug (signed state, reject on mismatch).
- Lock down `/api/extension/config` (no secrets to unauthenticated callers, no CORS `*`).
- `REQUIRE_AUTH=true` on Railway; CORS allowlist updated for the renamed Vercel project.
- Custom SMTP (Resend) on Supabase so password reset works at volume; `site_url` correct.
- Trial clock + 250-check limit enforced server-side, plus comp-account override so pilot firms are not cut off.
- Remove Extraction Method choice, Extraction Engines and Live Progress panels (screenshots).
- New logo in app, extension and favicon (versions 1 and 7, #6366f1 / #10b981).

### 2. P1 — v17 core workflow (Phase 1)
Shell and nav per v17; single `/reconcile` route with batch-driven stepper Upload → Match → Review → Approve; Match auto-advances; Review merges QB Match + QB Comparisons into three tabs (Needs Attention / 100% Matches / All Checks) keeping every existing row action, the up-to-200-record view, and losing the spreadsheet look; side-by-side modal with check image; Approve & Clear page with server-side validation; **Continue Reconciliation** resume card; remove QB Match page, Analytics page, matching-preferences panel; top-bar company + account switcher per mockup; Connect QuickBooks card inline on step 1; purple sign-in button.

### 3. P2 — firm, billing, emails (Phase 2/3)
- Roles: Administrator and User; Users blocked from billing, reports, account edits — enforced server-side and in RLS. Build the four missing `/api/team/*` routes and invite-accept page on existing `team_invitations`.
- **MFA** (Supabase TOTP) enrol + challenge, required for Administrators.
- Super Admin: comp accounts with expiry and reason, trial status, usage, Stripe links, overrides logged.
- Signup per `signup.html` (names, firm, 8-char password, consent, no plan picker); one trial per QuickBooks realm ID + email verification + disposable-domain block.
- Stripe per `STRIPE-BILLING-REQUIREMENTS.md`: Essential / Professional / Scale, monthly via Checkout, annual via Subscriptions API mixed-interval, metered overage, 8 webhooks verified and idempotent, anniversary renewal, Customer Portal, billing page fields, plan change/cancel/reactivate, dunning grace, renewal reminder 30 days out.
- Usage ledger: immutable, one row per successfully processed check, idempotency key per processing event, repeat upload counts, retry does not; duplicate-upload prompt "uploaded previously on <date> — process again and count it?".
- QuickBooks connection health: status column on `qb_connections`, failure writes in both refresh paths, scheduled check, Reconnect pill in switcher.
- Emails: Resend on `updates.kyriq.com`, the 6 ready triggers + 3 QBO + 10 trial/usage + Stripe-native config; unsubscribe route before any non-transactional mail.
- History (batches table), Reports, Firm Admin (absorbs Analytics).
- Upload retention: delete uploaded files 14 days after the reconciliation completes, keep extracted data.
- Bank statement accuracy: wire `_filter_check_backs`, per-region confidence, per-page checkboxes, format vote across all pages.

### 4. P2 — Chrome extension parity
Restyle side panel to brand and the `/extension` design: header selectors, Sync, connected status, usage meter; tabs Upload · Match · Review · Approve · History; Needs Attention chips; colour-coded cards. **Open QuickBooks to the firm's company the user is working on** and show each approved item clearing. Chrome Web Store listing: publisher Kyriq, support@kyriq.com, verified kyriq.com.

### 5. P2 — Website
Implement the redesign site copy verbatim (hero with bank statement + typed/handwritten, four steps, three cards, pricing with toggle and terms, 15-question FAQ, CTA band); remove watch demo, "trusted by 500+", testimonials; all CTAs to `/signup`; real logo and colours.

### 6. Accounts and DNS (ops, not code)
Google Workspace TXT verification in Vercel DNS; Resend SPF/DKIM/DMARC for `updates.kyriq.com`; Search Console verification for the Chrome listing; Stripe Test and Live product/price IDs in env per environment; Vercel Pro seats.

### 7. Answers to send Michael
The five open questions with the recommended answers above, plus: extension will match the app's look and options; MFA yes; comp accounts yes; email copy word change "uploads" → "processed".

### 8. Definition of done
Stripe acceptance list from the v17 doc §14 run in Test Mode; trial both limits; role matrix tested as User, Administrator, Super Admin; extension tested on a QBO sandbox register; no raw `{{variable}}` in any email; graph refreshed with `python -m graphify update .`.

## Verification of this step
- Every checklist item names a file path or an external system and the document that requires it.
- Spot-check five file references with `grep` before saving.
- Read the finished file once top to bottom for contradictions with the settled-decisions table.
- Commit `CHECKLIST.md` on `main` (docs only) and send it to the user.
