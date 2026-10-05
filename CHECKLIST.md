# Kyriq build checklist

Everything expected for the v17 release, in build order. Each item names the files it touches, the
document that requires it, and how we know it is done.

**Target:** pilot firms on the app. **Reference pack:** `new changes/`.

---

## 0. Ground rules

**Source of truth, in order.** Where two sources disagree, the higher one wins:

1. `Kyriq-Developer-Handoff-v17.zip` → `STRIPE-BILLING-REQUIREMENTS.md` (billing is settled there)
2. The approved redesign site at `kyriq-website-redesign.michael389314.chatgpt.site/website.html` (marketing copy, FAQ)
3. v17 HTML prototype (page structure, stepper, navigation)
4. The client's 21-item list in `Update website with correct info.docx` (product changes)
5. The two email specification documents

**v17 governs structure. DepthMe governs surface.** The prototype says which pages exist and how
the workflow flows. It does not define the look. The look is the premium glass system in section 2.

**Build v2 alongside v1.** New surfaces behind `NEXT_PUBLIC_UI_V2`. v1 stays reachable until
Michael signs off, then the flag is removed and v1 pages are deleted in the cleanup pass. Michael
confirmed nothing is in daily use that must stay up.

**No pilot firm sees a half-restyled app.** The full redesign lands before anyone logs in. That is a
deliberate choice: a firm evaluating the product forms its judgement in the first two minutes, and a
mixed-styling app reads as unfinished. It moves the trial start out by several days, so tell Michael
the new date rather than letting it slip quietly. Section 1 still goes first, because those fixes are
security, not polish.

**Non-negotiables carried from past defects in this repo:**

- Every write carries `tenant_id`. If a write succeeds but does not persist, suspect RLS first.
- Check table and column names against `supabase/migrations/` before writing any query.
- Every migration is idempotent.
- OAuth credential resolution stays identical in `auth.ts` and `callback.ts`, and every value is trimmed.
- QuickBooks updates are sparse. Handle empty 204 bodies.
- Extension actions never fan out to rows the user did not click.
- A 200 is not proof of success. Assert on the parsed shape.

**Do not merge these five files.** They came in `new changes/` and were reviewed:

| File | Why not |
|---|---|
| `Kyriq_Extension_background.js` | Embeds the Intuit **client secret** in the extension, stores refresh tokens in `chrome.storage`, has no tenant model, and its approve path only logs instead of clearing. Replacing the service worker with it would remove most features. |
| `qb-routes.js` | Express + Prisma; cannot run in this stack. Every table and column name is wrong, scopes by user not tenant, and its expiry check uses the 1-hour access token so every company would show "needs reconnect" after an hour. |
| `useQBClients.js` | Duplicates `hooks/useQBConnections.tsx`, keeps the active company in localStorage only so the UI and backend disagree on which company is active, and crashes during server-side rendering. |
| `ClientAccountSwitcher.jsx` | Use as a **design reference only**. Calls routes that do not exist. |
| `Kyriq_Switcher_Mockup.html` | Design reference. Build it on the existing data layer. |

**Quality gate on every item:** `cd frontend && npm run type-check && npm run lint && npm run build`
green, the change exercised in a browser, and a screenshot at 1440px and 400px.

---

## 1. P0 — before any pilot firm logs in

Security and correctness. None of this is visible, all of it is blocking.

- [x] **Fix the cross-tenant QuickBooks attach.** `frontend/pages/api/qbo/callback.ts:32-59` decodes
      `tenant_id` from unsigned base64 `state` and only warns on a CSRF mismatch, with the comment
      "Don't fail - just warn". A crafted state can attach a QuickBooks company to another firm.
      Sign the state with an HMAC, or store a nonce server-side keyed to the session, and reject on
      mismatch. *Done when:* a tampered state is rejected and logged.
      **Done:** state is HMAC-signed in `frontend/lib/qbo-state.ts` (`signState`/`verifyState`),
      signed in `pages/api/qbo/auth.ts` and verified in `pages/api/qbo/callback.ts`, which now
      rejects a bad signature, an expired state and a cookie mismatch instead of warning. Secret is
      `QBO_STATE_SECRET`, falling back to `SUPABASE_SERVICE_ROLE_KEY`. Self-check:
      `npx tsx lib/qbo-state.check.ts` — it asserts the exact forgery (re-encoded `tenant_id`) is
      rejected, and that an unsigned legacy state is too.
- [x] **Lock down `frontend/pages/api/extension/config.ts`.** It serves with CORS `*` and has an
      unauthenticated path that returns configuration. Require a valid session; drop the wildcard.
      **Done:** the unauthenticated branch is gone (the extension already ships the public Supabase
      URL and anon key in its own `BOOTSTRAP_CONFIG` and merges them over the response, so it never
      needed it). CORS now reflects only `chrome-extension://` origins, pinnable with
      `EXTENSION_ORIGINS`. The same wildcard was in `pages/api/extension/qb/refresh-token.ts`, so
      both now share `frontend/lib/extension-cors.ts`.
- [ ] **Turn on `REQUIRE_AUTH=true`** on the Railway backend so `/api/*` verifies JWTs.
- [x] **Update the backend CORS allowlist.** `backend/api_server.py:568` still names
      `check-extractor-frontend.vercel.app`. The Vercel project was renamed to Kyriq, which changes
      preview URLs. **Done:** list trimmed to the real origins and the `"*"` entry removed — it had
      been appended last, which made the whole allowlist inert. Previews now match
      `allow_origin_regex` covering the Kyriq and legacy project names.
- [ ] **Make duplicate detection database-backed.** `backend/api_server.py` ~944 checks duplicates
      against in-memory jobs only, with the comment saying so. After a restart the same file creates
      a new job, so identical customer behaviour would be billed differently. This blocks the usage
      ledger.
- [ ] **Custom SMTP through Resend on Supabase**, and correct `site_url`. Without it auth email goes
      through the shared default sender, rate limited to a handful per hour, so password reset fails
      at real volume. **Partly done:** `supabase/config.toml` now has `site_url` on 3080 and a real
      `additional_redirect_urls` list. The Resend SMTP credentials themselves are a dashboard
      setting, so they stay an ops item (section 14).
- [ ] **Trial enforcement server-side:** 14 days or 250 successfully processed checks, whichever
      first. Processing stops; history stays viewable. Include the comp-account override from
      section 5 so pilot firms are not cut off mid-test.
- [x] **Remove the extraction choices** Michael asked to remove. `EXTRACTION_METHODS` in
      `frontend/app/(app)/upload/page.tsx:62` and its radio group around line 1164; the method list
      in `frontend/app/(app)/dashboard/components/ConfigureExtractionDialog.tsx:191`. Kyriq picks the
      engine. *From: "Don't make them choose OCR settings, image settings, confidence levels."*
      **Done:** both method pickers removed; the engine is a module constant in each file. The
      re-extract path also had a `window.confirm` asking whether to use all engines that then did
      nothing but show an alert — that is gone too.
- [x] **Remove the Extraction Engines and Live Progress panels** from
      `frontend/app/(app)/process/[id]/page.tsx` (one grid block spanning roughly lines 353-430).
      Keep the status card and the stage stepper. *From the 21 September screenshot.*
      **Done:** both panels removed along with the now-dead `progressLogs`, `logsEndRef`,
      `methodBarColor` and the `Terminal` import. The post-completion "Extraction Method Results"
      summary is kept — it was not in the screenshot's scope.
- [ ] **Ship the new logo.** Versions 1 (horizontal wordmark) and 7 (square K icon) from the logo
      pack. **Blocked:** `Kyriq Logo - All Source files - 12 versions.zip` is not in the repo —
      `new changes/` has the proposals, specs, screenshots and the switcher mockup but no logo pack,
      so versions 1 and 7 are not available to ship. Brand colours Indigo `#6366f1` and Emerald
      `#10b981` are in the design tokens regardless. Font Cera Round Pro Bold. Replace
      `frontend/public/Kyriq_Logo_Files/*`, `frontend/public/logo.png`, `chrome-extension/icons/*`
      and the favicon. The redesign site still uses placeholder purples; use the real logo colours.

---

## 2. P0 — the premium glass design system

The whole app moves to an Apple-style glass aesthetic matching depthme.app. This is the foundation
every later UI item builds on, so it lands before the page work.

**Stack:** Tailwind **v3.4.1 with `tailwind.config.js`** (not v4, so no `@theme inline`). Already
available: `framer-motion` 12.38, `class-variance-authority`, `clsx`, `tailwind-merge`,
`lucide-react`. No new dependencies.

### 2.0 The decision: light glass on a dark shell

DepthMe's own look is dark, because it is a meditation app sitting on full-bleed artwork. Kyriq is a
financial tool that accountants read for eight hours, and both the signed-off v17 prototype and the
approved website are light. So we take DepthMe's **techniques** and apply them to a light substrate:

- **Page:** a soft indigo-tinted gradient mesh, fixed, very slow drift.
- **Cards:** `rgba(255,255,255,0.72)` with `backdrop-filter: blur(18px) saturate(120%)`.
- **Border:** `1px solid rgba(255,255,255,0.7)` plus an inset top highlight.
- **Sidebar:** stays dark and becomes true glass rather than a flat navy block.
- **Text:** full-strength slate on glass, never washed out.

Dark mode stays possible later; the `.dark` block already exists in `globals.css` and is currently
dead. Do not build it now, but do not write tokens that make it impossible.

### 2.1 Tokens and foundation — one agent, blocks everything else

The values below are DepthMe's actual tokens, inverted for a light substrate where noted. Use these
numbers; do not re-derive them.

**Glass surface, the load-bearing recipe**

| Token | DepthMe (dark) | Kyriq (light) |
|---|---|---|
| Card background | `rgba(11,16,32,0.74)` | `rgba(255,255,255,0.72)` |
| Border | `1px solid rgba(255,255,255,0.08)` | `1px solid rgba(255,255,255,0.7)` |
| Shadow | `0 10px 30px rgba(0,0,0,0.35)` | `0 10px 30px rgba(15,23,42,0.08)` + contact shadow |
| Blur | `blur(18px) saturate(120%)` | same |
| Over bright areas | `blur(28px) saturate(150%)` | same, stated explicitly |
| Hairline | `rgba(255,255,255,0.06)` | `rgba(15,23,42,0.07)` |

- [ ] **State the blur explicitly, and carry contrast with `@supports`.** DepthMe learned this the
      hard way: their comment records that `backdrop-filter` computed to `none` in a real render and
      that WKWebView support is inconsistent. So blur is declared on the class rather than inherited,
      and an `@supports not (backdrop-filter: blur(1px))` block raises the background opacity so the
      card is still readable. Copy that pattern. A glass card that silently loses its blur must still
      look deliberate.
- [ ] **Radius scale**, straight from DepthMe: inputs 14px, buttons 16px, pills 20px, cards 24px.
      This replaces the current 325-vs-119 `rounded-lg`/`rounded-xl` coin-toss.
- [ ] **Motion tokens.** Easing `cubic-bezier(0.23, 1, 0.32, 1)` is the house curve for everything
      that settles. Durations: tap 120ms, quick 200ms, settle 240ms, reveal 280ms. Press state is
      `transform: scale(0.96)`. Disabled is `opacity: 0.45`. Honour `prefers-reduced-motion`.
- [ ] **Buttons are pills.** `border-radius: 9999px`, `min-height: 3rem`, inline-flex centred with a
      `0.5rem` gap. Primary carries a 90-degree gradient in the brand indigo; ghost is a hairline
      pill, `1px solid rgba(…,0.14)` over a faint tint.
- [ ] **Type.** One heading face behind a single token, the way DepthMe fixed theirs. Their note is
      worth heeding: a font imported inside one screen and used nowhere else is why that screen read
      as designed and the rest did not. Set it once, at the root. `-apple-system` leads the stack.
      Negative tracking on display sizes only.
- [ ] **The ambient background.** A fixed, slowly drifting gradient mesh behind the shell. Glass over
      a flat page looks like a rendering bug; it needs something to refract.
- [ ] **`font-variant-numeric: tabular-nums`** on every monetary and numeric column. Non-negotiable
      in a reconciliation product where columns of figures must align.
- [ ] **Map every token into `tailwind.config.js`**, not just into `:root`. The current file has
      variables in CSS that were never added to the theme, which is why the `@apply` block is broken.

### 2.2 Primitives — same agent, same stage

Built with cva so each variant is declared once: `GlassCard`, `GlassPanel`, `Button` (primary,
secondary, ghost, destructive), `Input` and `Field`, `Sheet` and `Dialog`, `Tabs`, `Badge` and
status pills, `Toast`, skeletons, `KpiTile`, and the table shell with its sticky header.

**The ten rules these must follow:**

1. Glass needs something behind it. Every translucent surface sits over the mesh.
2. One blur tier per depth. Shell chrome heaviest, cards medium, popovers and sheets heaviest with
   most opacity. Never nest two blurred surfaces directly.
3. Every glass surface carries a 1px translucent light border plus a top inner highlight. That
   highlight is what reads as glass rather than as grey.
4. Shadows layer two deep, a tight contact shadow plus a wide soft ambient one. No harsh `shadow-md`.
5. Display type is tight with negative tracking; body stays neutral. `-apple-system` first.
6. Motion is spring, not linear. Press scales down slightly, entrances rise and fade.
   `prefers-reduced-motion` honoured everywhere.
7. **Density does not regress.** The premium look costs no rows on screen. Tables keep row height,
   scroll in their own container, one scrollbar per page.
8. Full-strength body text over glass. Translucency eats contrast and professionals read this all day.
9. Every state colour verified to 4.5:1 in both themes.
10. Glass is neutral; colour marks state and action only.

### 2.3 Page restyle — parallel agents, disjoint file sets

Roughly **18,800 lines across 80 files**. The repo is unusually decoupled: **no component is imported
by three or more pages**, and the maximum fan-out is two. That makes parallel work safe, provided the
parcels below are respected exactly. Each agent may use **only** the Stage 2.2 primitives; an agent
that needs a primitive changed reports back rather than editing it. That rule is what stops five
different glass cards appearing.

| Parcel | Scope | Lines |
|---|---|---|
| **A** (blocking) | Tokens, `tailwind.config.js`, `globals.css`, `lib/utils.ts`, root layout, `ToastProvider`, plus the new `components/ui/*` primitives. Also owns the only two components shared by two pages, `DeleteConfirmModal` and `QBCompanySwitcher`, so nobody else touches them. | ~1,160 |
| **B** | Both app shells, sidebar chrome, switchers, auth layout, 404, OAuth-complete. Owns all three hardcoded background hexes and both fixed sidebar widths. | 929 |
| **C** | Upload flow: `upload/page.tsx` and its three components. | 1,730 |
| **D** | Settings, team, and all four auth pages. The heaviest form surface, so this agent sets how glass inputs feel. | 2,120 |
| **E** | QB Comparisons page and its seven components. Largest parcel; split the table from the modals if needed. | 3,180 |
| **F** | Dashboard, process, review and their components. | 3,944 |
| **G** | Firm dashboard, reconciliation, super admin, analytics and all five admin pages. **All four Recharts files live here** so one agent defines the chart palette once. | 2,936 |
| **H** | QB integration components, match, export, billing. | 2,535 |
| **I** | Landing page, Magic-UI decorative components and the legal pages. Holds 20 of the 23 hardcoded hexes and all framer-motion usage. Can run in parallel with A. | 2,325 |

- [ ] **Order:** A merges first. B can start as soon as A's token names are frozen, since it needs
      names not primitives. C through I start once A is merged. I may run alongside A.
- [ ] **Coordination point between A and I.** The `components/ui/*` decorative components depend on
      custom keyframes in `tailwind.config.js`: `marquee`, `border-beam`, `shimmer-slide`,
      `spin-around`, plus `--duration`, `--speed` and `--gap` variables. Parcel A must preserve them
      verbatim or hand ownership to I. Rewriting the keyframes silently breaks all four.

### 2.4 Debt to clear while restyling

Found during the inventory. Each is cheap now and expensive later.

- [ ] **Fix the broken `@apply` block in `globals.css`.** It applies `from-primary-light`,
      `bg-success-bg`, `bg-success-dark`, `bg-error-bg`, `text-error-text`, `bg-warning-bg` and
      `text-warning-text`. Those CSS variables exist in `:root` but were **never mapped into
      `tailwind.config.js`**, so the utilities do not exist and the pill and button classes are
      silently inert today. Parcel A fixes this.
- [ ] **Adopt `cva`.** It is installed and imported **nowhere**. The primitives are its first use.
- [x] **Delete `app/(app)/qb-comparisons/page.old.tsx`**, 1,008 lines of dead code sitting in a route
      folder. Next.js will not route it, but a styling agent would burn a whole budget on it.
- [ ] **Pick one radius.** `rounded-lg` appears 325 times and `rounded-xl` 119 times with no rule.
- [ ] **Collapse five table-header systems into one.** There are at least five mutually inconsistent
      `<th>` recipes across the app.
- [ ] **Decide the real primary colour.** The brand purple in `--primary` is barely used in
      classNames; `bg-blue-600` is the de-facto primary at 23 occurrences. The new brand is Indigo
      `#6366f1`, so this resolves itself, but every `blue-600` call site has to move.
- [ ] **Resolve the duplicate legal pages** before styling both: `(public)/terms` versus
      `(public)/legal/terms`, and the same for privacy.
- [ ] **Decide whether the two shells unify.** `(app)` has a dark sidebar, `(admin)` a light glass
      one. Parcel B owns both so the answer is consistent either way.
- [ ] **Dark mode is currently dead.** A full `.dark` override block exists in `globals.css` but
      nothing toggles it and no `dark:` prefix is used anywhere. Either wire a theme provider or drop
      the block; leaving it is how it rots.

### 2.5 Performance and QA

- [ ] **Budget the blur.** `backdrop-filter` is expensive and the comparison grid renders hundreds of
      rows. Glass goes on containers and headers, never on individual rows. Test on the 428-check
      batch and watch frame rate.
- [ ] **Rewire Recharts explicitly.** Chart colours are JS props, not classNames, so a token swap
      does not reach them and charts will drift from the new surfaces. Also note
      `ResponsiveContainer` breaks inside a parent that gains `backdrop-filter` and `overflow-hidden`
      without an explicit height.
- [ ] **Handle the 17 files using inline `style`.** They bypass Tailwind entirely and will drift.
      Highest risk are the ones doing dynamic width, transform or colour maths: upload progress, the
      process timeline and stage indicator, the check image viewer, comparison table column widths,
      and `MatchRow`.
- [ ] **Dropzone drag states.** The drop target styles its active and reject states from hook
      booleans, so glassifying the resting state alone leaves the others looking broken.
- [ ] Every route at 1440px and 400px, both themes. No page scrolls twice. No hardcoded hex outside
      the token file.

---

## 3. P1 — v17 core workflow

Structure from the v17 prototype, surface from section 2.

- [ ] **Shell and navigation** per v17: Reconcile, History, Reports, Companies, Connections, Users,
      Settings, Billing, and the admin section.
- [ ] **One `/reconcile` route** with a batch-driven stepper: Upload → Match → Review → Approve. Step
      state comes from the batch record, not from which page is open. Forward steps stay locked until
      the prior one is genuinely complete. In the prototype these are plain links and Approve is
      reachable from Upload.
- [ ] **Match auto-advances.** The user does nothing there, so it is a progress screen that moves on
      by itself when matching finishes.
- [ ] **Review merges QB Match and QB Comparisons** into three tabs: Needs Attention, 100% Matches,
      All Checks. Keep every existing row action (approve, remap, resolve, flag, note, edit in QB,
      create in QB, undo), keep the up-to-200-record view, and lose the spreadsheet look.
      *From: "I would like to get rid of the Excel look."*
- [ ] **Side-by-side review modal** with the check image next to the QuickBooks record.
- [ ] **Approve and Clear** page: batch summary, pre-flight checks, server-side validation before any
      write, bulk clear, audit entries.
- [ ] **Continue Reconciliation card.** If someone closes Kyriq mid-flow, they resume exactly where
      they stopped with no re-upload and no re-approval. Shows company, account, period, step N of 4,
      and how many checks need attention. *Michael's mock: "ABC Construction LLC · Operating Checking
      / August 2026 / Step 3 of 4 — 24 checks need attention."*
- [ ] **Remove the QB Match page** as a separate route.
- [ ] **Remove the Analytics page**; its content moves into Firm Admin.
- [ ] **Remove the matching-preferences panel** from Settings. Keep one control, the auto-approve
      threshold, next to the Approve All button where it is used.
- [ ] **Connect QuickBooks card inline on step 1** when no company is connected, so a new user never
      leaves the flow to go to Settings.
- [ ] Sign-in button purple, matching the website.

---

## 4. P1 — company and account switchers

Build the design from `Kyriq_Switcher_Mockup.html` on the existing data layer, not on the client's
hook.

- [ ] Move both switchers from the sidebar to the **top bar**.
- [ ] **Company switcher:** avatar with initials, search, per-row connected or needs-reconnect
      status with account count, a checkmark on the active company, per-row disconnect behind a
      proper modal rather than `confirm()`, and "Add New Client" in the footer.
- [ ] **Account switcher:** grouped into Bank Accounts and Credit Cards, each row showing name, last
      four, sub-type and balance, with a refresh action.
- [ ] **Accounts need a real source.** Today `AccountSwitcher` builds strings from `qb_entries.account`
      with no type, balance or last four. Either add a `qb_accounts` table with `tenant_id` and RLS,
      or extend `pages/api/qbo/accounts.ts`, which is currently single-company and Bank-only.
- [ ] Keep the active company **server-side** in `qb_connections.is_active`. The matching routes and
      the extension all read it; a localStorage-only switch would show company B while matching
      company A.
- [ ] Show the pending-match count that already exists in `/api/qb/connections`.

---

## 5. P2 — roles, access and accounts

- [ ] **Two roles: Administrator and User.** Users get no billing, no reports, no account editing.
      Enforced server-side and in RLS, not by hiding menu items. `profiles.role` already exists with
      admin/member/viewer. *From item 4 of the client list.*
- [ ] **Build the four missing team endpoints.** `/settings/team` already calls `/api/team/members`,
      `/api/team/invite` and `/api/team/members/[id]` for DELETE and PATCH. None exist, so inviting a
      user currently fails silently. The `team_invitations` table, token and 7-day expiry are already
      in `supabase/migrations/001_schema.sql`.
- [ ] **Invitation accept page** at a token URL. None exists.
- [ ] **MFA.** Supabase Auth TOTP enrolment and challenge, required for Administrators. No MFA code
      exists today; it appears only in the legal pages.
- [ ] **Comp accounts.** Super Admin grants a free account for a set period, with a reason and an
      expiry, written to the audit log. This is how the pilot firms get in.
      *From: "Make it possible for me (super Admin) to give free accounts."*
- [ ] **Super Admin view** per the v17 billing doc: firm, plan, billing frequency, trial status and
      usage, subscription status, monthly usage, overage, payment status, paid-through date,
      cancellation status, Stripe IDs and links. Overrides, credits and refunds all logged.

---

## 6. P2 — signup, trial and abuse control

- [ ] **Signup per `signup.html`:** first name, last name, firm name, work email, password of at
      least 8 characters, and a required terms and privacy consent checkbox. No plan picker. The
      current `/signup` has a plan picker, a 6-character minimum, no names and no consent.
- [ ] **Public CTAs say "Start Free Trial"** and route to signup, never to login or a prototype page.
- [ ] **Email verification on.** `supabase/config.toml` has `enable_confirmations = false`, which is
      why signup currently drops straight to the dashboard. Turning it on changes that flow, so the
      trial clock should start at verification.
- [ ] **One trial per QuickBooks realm.** Michael asked how to stop people opening trials with
      multiple emails. The firm's QuickBooks company ID is the natural identity: verified email,
      plus one trial per realm, plus a disposable-domain block.
- [ ] **Trial meter visible in-app:** days remaining and checks remaining.

---

## 7. P2 — Stripe billing

Everything here comes from `STRIPE-BILLING-REQUIREMENTS.md`.

| Plan | Monthly | Annual | Checks / month | Overage |
|---|---|---|---|---|
| Essential | $147 | $1,617 | 1,200 | $0.15 |
| Professional (Most Popular) | $497 | $5,467 | 4,500 | $0.12 |
| Scale | $997 | $10,967 | 10,000 | $0.10 |

- [ ] Products and prices in Stripe **Test and Live**, IDs in environment variables separated by
      environment.
- [ ] Monthly plans through Checkout.
- [ ] **Annual through the Subscriptions API in flexible billing mode.** Annual base plus monthly
      metered overage is a mixed-interval subscription, and standard Checkout Sessions do not create
      one. The doc explicitly says not to present that limitation as a finished annual implementation.
- [ ] Monthly allowance resets monthly for annual customers too. Not one annual pool.
- [ ] **Renewal on the same date each month**, regardless of when someone subscribed.
      *From item 17 of the client list.*
- [ ] **Eight webhooks**, signature-verified and processed idempotently: `checkout.session.completed`,
      `customer.subscription.created`, `.updated`, `.deleted`, `invoice.created`, `invoice.finalized`,
      `invoice.paid`, `invoice.payment_failed`.
- [ ] **Paid access activates only after a verified webhook.** Never on a success-page redirect.
- [ ] Billing page showing plan, frequency, base price, commitment and renewal terms, included
      checks, usage, remaining, overage quantity and estimate, period dates, paid-through date,
      status, invoice history, payment method, and controls to change plan, cancel renewal and
      reactivate.
- [ ] Plan changes with charges, credits and effective dates disclosed before confirmation.
- [ ] Payment failure: in-app warning, grace period, then processing restricted while history stays
      viewable, and automatic restoration on payment.
- [ ] Cancellation: monthly ends at period end; annual disables renewal but runs to the paid-through
      date; reactivation before that date; incurred overages still payable.
- [ ] Renewal reminder roughly 30 days before an annual charge.
- [ ] Refunds require an authorised Super Admin action with a recorded reason.

---

## 8. P2 — usage ledger

The billing system is only as trustworthy as this table.

- [ ] **Immutable ledger**, one row per successfully processed check, carrying firm, user, company,
      check, processing event, timestamp, billing period and the Stripe event reference.
- [ ] **Count on success only.** Failed OCR does not count.
- [ ] **Multiple checks on one page count individually.**
- [ ] **Idempotency key per processing event** so automatic retries never double-count.
- [ ] **Repeat uploads count again**, and the user is told first: warn that the file was uploaded on
      a given date and let them confirm it should be processed and counted.
      *From Michael, 30 September.*
- [ ] **Count detected checks, not pages.** A 40-page bank statement containing 6 checks bills 6.
      This makes detection accuracy a billing-correctness issue, which is why section 10 matters.
- [ ] Reconcilable meter events submitted to Stripe; Kyriq stays the source of truth for check-level
      detail, Stripe for subscription state.

---

## 9. P2 — email

Full analysis in `docs/EMAIL-SPEC-REVIEW.md`.

- [ ] Resend on `updates.kyriq.com`, SPF, DKIM and DMARC before any sending. Sender
      `Kyriq <notifications@updates.kyriq.com>`, reply-to `support@kyriq.com`.
- [ ] **Six emails whose triggers already exist:** invitation sent, accepted and expired, member
      removed, role changed, processing failed.
- [ ] **Three QuickBooks emails need groundwork first.** `qb_connections` has no status column;
      `is_active` means "currently selected", not "healthy". Both token refresh paths currently write
      a log line and nothing else, so a dead connection is invisible until a user trips over it. Add
      the status column, write on failure in both paths, and add a scheduled health check.
- [ ] **Ten trial and usage emails** once the ledger exists.
- [ ] **Four Stripe-native notices** configured with Kyriq branding, not rebuilt.
- [ ] **Unsubscribe route and token before any non-transactional email.** The published privacy
      policy already tells users they can unsubscribe through a link or account settings. Neither
      exists, which is a compliance exposure the moment a digest or marketing email ships.
- [ ] **Settle one wording conflict.** The email spec says "check uploads"; the website, FAQ and
      Stripe document all say "processed checks" and count on success. The Stripe document is
      authoritative, so the email copy needs the word changed. It is marked locked copy, so Michael
      must approve.

---

## 10. P2 — bank statement extraction

Michael called this "a BIG deal" and wants it on the website. Most of it already works.

**What already happens:** the PDF is rasterised page by page, detection runs on each page
independently with geometry and ink filters, pages with no checks are skipped silently, the analyze
endpoint already returns a per-page `checks_on_page` count, and the preview already shows every page
with its count.

- [ ] **Wire up `_filter_check_backs()`** in `backend/check_extractor.py`. It already exists, analyses
      ink projection and the MICR strip, and is never called.
- [ ] **Add a confidence score per detected region** and reject low-confidence pages. Two paths
      currently emit false checks from ruled statement tables: the format-A branch falls back to grid
      boxes when contour detection finds none, and the auto-detect branch keeps both detector outputs
      when neither is confident. The page gate needs only one box to pass.
- [ ] **Fix the format vote.** It samples only the first three pages, so a statement whose opening
      pages are text sets the wrong hint for the check pages that follow.
- [ ] **Per-page checkboxes** instead of the contiguous range, defaulted to pages where checks were
      found.
- [ ] Decide whether a downloadable checks-only PDF is wanted. Nothing in the stack can write a PDF
      today, so that needs a new library. Skipping the external tool may be the whole requirement.

---

## 11. P2 — Chrome extension

The client requires the extension to match the app in look and options.

- [ ] **Restyle to the new brand and the glass system.** `sidepanel.css` is 1068 lines of plain CSS
      using QuickBooks green `#2CA01C` while the app uses navy. Port the tokens by hand here, plus
      `popup.css` and `qbo-overlay.css`.
- [ ] **Match the approved `/extension` design:** header with company and account selectors, sync
      action, connection status, usage meter; tabs for Upload, Match, Review, Approve and History;
      Needs Attention chips for lower confidence, duplicates, discrepancies and no match;
      colour-coded cards.
- [ ] **Open QuickBooks to the company the user is working on**, so they watch Kyriq clear each
      approved item. *From item 7 of the client list.*
- [ ] New logo in all icon sizes.
- [ ] Chrome Web Store listing: publisher **Kyriq**, contact `support@kyriq.com`, official URL
      `kyriq.com` verified in Search Console. The personal developer account can be ignored; it
      cannot be removed and does not appear on the listing.

---

## 12. P2 — website

Implement the approved redesign copy verbatim from
`kyriq-website-redesign.michael389314.chatgpt.site/website.html`.

- [ ] Hero leading with the bank statement: *"Start with the bank statement you already download."*
      and *"Typed or handwritten—Kyriq can read both."*
- [ ] Four-step section, three value cards, pricing with the monthly and annual toggle, the usage and
      overage explanation, and the annual terms block.
- [ ] **The 15-question FAQ**, verbatim.
- [ ] **Remove** the watch-demo button, "trusted by 500+ accounting firms", and all testimonials.
      *From item 1 of the client list.*
- [ ] Every CTA routes to `/signup`.
- [ ] Real logo and brand colours. The redesign site uses placeholder purples and greens.
- [ ] Note on every plan that the Chrome extension is included.

---

## 13. P2 — history, reports, retention

- [ ] **Batches table.** History needs a real batch record; the app only has jobs today. The stepper
      and the Continue Reconciliation card also depend on it.
- [ ] **History page:** past batches with approver, status and export.
- [ ] **Reports page** with date, company and account filters.
- [ ] **Firm Admin** absorbing the Analytics content.
- [ ] **Upload retention.** Delete uploaded files 14 days after a reconciliation completes, keeping
      extracted data and history. *Michael asked about 7 or 14 days; 14 is the safer default and is
      worth stating in the privacy policy.*

---

## 14. Accounts, DNS and ops

Not code, but launch-blocking.

- [ ] Google Workspace domain verification TXT record in Vercel DNS.
- [ ] Resend SPF, DKIM and DMARC on `updates.kyriq.com`.
- [ ] `kyriq.com` verified in Google Search Console for the Chrome listing.
- [ ] Stripe Test and Live product and price IDs in environment variables per environment.
- [ ] Vercel Pro, project renamed to Kyriq, team seats for the developers.
- [ ] Confirm the Intuit app is under Michael's account with production keys, and check the API read
      volume against the free tier's 500,000 monthly reads. It blocks rather than bills when exceeded,
      which would take every customer's sync down at once.

---

## 15. Answers owed to Michael

Written up and ready to send: `docs/proposals/Kyriq-Answers-and-Accounts.md`. It also carries the
ops list from section 14, the locked-copy wording question, and the note that the logo pack never
reached the repo.


- **Extension look and options:** yes, it will match the app. Section 11.
- **MFA:** yes. Section 5.
- **Free accounts for pilot firms:** yes, a Super Admin comp control with an expiry and a reason.
- **Do we still need the file import section?** Subscribers must have QuickBooks, so hide it from
  customers and keep it for Super Admin diagnostics. It is also the fallback when an API connection
  breaks mid-reconciliation.
- **Stopping repeat free trials:** one trial per QuickBooks realm, plus verified email and a
  disposable-domain block. Section 6.
- **How many email addresses:** one sending address, `notifications@updates.kyriq.com`, plus
  `support@kyriq.com` for replies. The others already created are useful but not required.
- **Auto-delete uploads:** yes, 14 days after the reconciliation completes. Section 13.

---

## 16. Definition of done

- [ ] The Stripe acceptance list in `STRIPE-BILLING-REQUIREMENTS.md` section 14 run in Test Mode:
      both trial limits, repeat-upload counting, retry deduplication, monthly and annual purchase for
      every plan, allowance resets for annual customers, overage invoices, upgrades and downgrades,
      payment method updates, failed payment grace and restoration, both cancellation paths,
      reactivation, renewal reminders, refund authorisation, and webhook retries.
- [ ] Role matrix tested as User, Administrator and Super Admin, with server-side enforcement
      verified by calling the endpoints directly, not just by checking the menu.
- [ ] An anon-key request returns zero rows for every new table.
- [ ] Extension tested by hand against a QuickBooks sandbox register and reconcile page.
- [ ] No raw `{{variable}}` placeholder can reach a customer in any email.
- [ ] Every route checked at 1440px and 400px in both themes, with one scrollbar per page.
- [ ] `npm run type-check && npm run lint && npm run build` green.
- [ ] Code graph refreshed: `python -m graphify update .`
