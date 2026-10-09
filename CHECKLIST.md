# Kyriq build checklist

Everything expected for the v17 release, in build order. Each item names the files it touches, the
document that requires it, and how we know it is done.

**Target:** pilot firms on the app. **Reference pack:** `new changes/`.

> **Audited 8 October 2026.** The ticks had fallen nine commits behind; 31 items were done but
> unticked. They have been corrected against the code, not against memory.
>
> **Still blocking everything:** migrations 026–037 are unapplied. Paste
> `supabase/APPLY_PENDING_MIGRATIONS.sql` into the Supabase SQL editor and run it once. Until then the
> reconcile stepper, billing, email, history, trials and the switchers all read tables that do not
> exist. The code degrades honestly rather than faking data, but none of it can function.
>
> **One thing the Approve step does NOT do.** Finalising a batch marks it complete in Kyriq, writes
> the approver and an audit row, and is enforced by a database trigger. It does **not** write to
> QuickBooks. The old stub copy claimed it did, which was false, and the panel now says so plainly.
> Clearing happens per match from the Review screens or from the Chrome extension, which is the flow
> Michael described wanting to watch. A batch-level bulk clear is the one piece of scope deliberately
> left unbuilt: it writes to a customer's live accounting system in bulk and cannot be tested here
> without the migrations and a QuickBooks sandbox, so shipping it untested would be reckless.
>
> **Four items read as open but are partly built, deliberately:**
> - Annual Stripe billing is written and gated behind `STRIPE_ANNUAL_ENABLED`. It has never run
>   against Stripe, so it is not claimed as finished.
> - Stripe products and prices exist in code with env-var names per environment; the actual
>   products and env values are not created yet.
> - The renewal reminder records an in-app notice but does not send email; there is no renewal
>   template yet.
> - Approve and Clear validates server-side and is enforced by a database trigger, but the page
>   itself is still a disabled stub.
>
> Everything else left open is either account access (section 14), blocked on assets that never
> arrived (the logo pack, Michael's FAQ copy), or verification (section 16).

> **Status, 6 October 2026.** 69 of ~160 items done, on branch
> `feat/v2-glass-redesign-trial-and-roles`. Delivered: the P0 security fixes, Michael's removals,
> bank-statement detection, **all nine redesign parcels**, the usage ledger and trial enforcement,
> and roles/team/MFA. Verified green: `type-check`, `lint` (0 errors), a production build, and nine
> self-check scripts.
>
> **Three things block everything downstream, and two are not code:**
> 1. **Migrations 026–031 have never been applied to any database.** The ledger, trial limits, comp
>    accounts, team endpoints and MFA recovery are written and self-checked but cannot work, and the
>    `app_settings` leak stays open. No `psql`, no linked CLI, no DB credential in the environment.
> 2. **Nobody has seen the authenticated pages.** Only the public routes were genuinely looked at.
> 3. **The logo pack and the v17 handoff zip never reached the repo**, which blocks the logo and the
>    15-question FAQ.
>
> **Biggest piece still unbuilt: section 3**, the single `/reconcile` route with the batch-driven
> stepper and the Continue Reconciliation card — the heart of what the client asked for. The QB
> Match capability inventory needed to specify that merge now exists (11 page-level, 13 row-level
> capabilities, in the Parcel H commit message).
>
> **A recurring class worth naming:** four separate bugs this round were correct-looking source with
> the effect silently absent — a stripped `backdrop-filter`, four colliding shadow names,
> 34 unoverridable theme keys, and a frozen animation. None were findable by reading the code. All
> four are now asserted in `scripts/check-primitives.ts`. Expect more of this shape, and reach for a
> browser or a measurement rather than a re-read.

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
- [x] **Make duplicate detection database-backed.** `backend/api_server.py` ~944 checks duplicates
      against in-memory jobs only, with the comment saying so. After a restart the same file creates
      a new job, so identical customer behaviour would be billed differently. This blocks the usage
      ledger.
- [ ] **Custom SMTP through Resend on Supabase**, and correct `site_url`. Without it auth email goes
      through the shared default sender, rate limited to a handful per hour, so password reset fails
      at real volume. **Partly done:** `supabase/config.toml` now has `site_url` on 3080 and a real
      `additional_redirect_urls` list. The Resend SMTP credentials themselves are a dashboard
      setting, so they stay an ops item (section 14).
- [ ] **Set the HOSTED project's Site URL to `https://kyriq.com`.** `config.toml` only governs local
      development; the hosted project has its own setting and it is still `http://localhost:3000`.
      This surfaced on 9 Oct when an authenticator app displayed the two-factor code as
      "localhost:3000" on a user's phone. That particular symptom is fixed in code (the enrolment now
      passes an explicit issuer), but the same wrong value is what password-reset and email
      confirmation links are built from, so in production those links point at localhost. Dashboard →
      Authentication → URL Configuration.
- [x] **Trial enforcement server-side:** 14 days or 250 successfully processed checks, whichever
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

- [x] **State the blur explicitly, and carry contrast with `@supports`.** DepthMe learned this the
      hard way: their comment records that `backdrop-filter` computed to `none` in a real render and
      that WKWebView support is inconsistent. So blur is declared on the class rather than inherited,
      and an `@supports not (backdrop-filter: blur(1px))` block raises the background opacity so the
      card is still readable. Copy that pattern. A glass card that silently loses its blur must still
      look deliberate.
- [x] **Radius scale**, straight from DepthMe: inputs 14px, buttons 16px, pills 20px, cards 24px.
      This replaces the current 325-vs-119 `rounded-lg`/`rounded-xl` coin-toss.
- [x] **Motion tokens.** Easing `cubic-bezier(0.23, 1, 0.32, 1)` is the house curve for everything
      that settles. Durations: tap 120ms, quick 200ms, settle 240ms, reveal 280ms. Press state is
      `transform: scale(0.96)`. Disabled is `opacity: 0.45`. Honour `prefers-reduced-motion`.
- [x] **Buttons are pills.** `border-radius: 9999px`, `min-height: 3rem`, inline-flex centred with a
      `0.5rem` gap. Primary carries a 90-degree gradient in the brand indigo; ghost is a hairline
      pill, `1px solid rgba(…,0.14)` over a faint tint.
- [x] **Type.** One heading face behind a single token, the way DepthMe fixed theirs. Their note is
      worth heeding: a font imported inside one screen and used nowhere else is why that screen read
      as designed and the rest did not. Set it once, at the root. `-apple-system` leads the stack.
      Negative tracking on display sizes only.
- [x] **The ambient background.** A fixed, slowly drifting gradient mesh behind the shell. Glass over
      a flat page looks like a rendering bug; it needs something to refract.
- [x] **`font-variant-numeric: tabular-nums`** on every monetary and numeric column. Non-negotiable
      in a reconciliation product where columns of figures must align.
- [x] **Map every token into `tailwind.config.js`**, not just into `:root`. The current file has
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

**All nine parcels are merged.** Roughly 2,400 raw palette utilities and 160 literal hexes removed
across the app, every parcel leaving a runnable self-check behind.

| Parcel | Scope | Migrated | Notable |
|---|---|---|---|
| **A** | Tokens, config, primitives | — | `@apply` block was inert; `--success-dark` failed contrast at 3.0:1 |
| **B** | Both shells, switchers, auth layout, 404, OAuth-complete | 3 hexes, 2 fixed widths | **Both shells unified** on dark glass |
| **C** | Upload flow | 9 `blue-600` + all palette | Dropzone had only 1 of its 3 states; `window.confirm` → Dialog |
| **D** | Settings, team, four auth pages | 366 palette | Form-state pattern for the app; signup rebuilt |
| **E** | QB Comparisons | 15 hexes, 18 `blue-600` | Kept 22px rows; **added the missing 200-record option** |
| **F** | Dashboard, process, review | ~180 palette | Blur budget 7/5/4, row-independent; 809 dead lines deleted |
| **G** | Admin, firm dashboard, reconciliation, charts | 833 palette, 61 hexes | One chart palette; 3 chart bugs only the browser caught |
| **H** | QB integration, match, export, billing | 526 palette | **Removed fabricated invoice history**; fixed 400px clipping |
| **I** | Landing, legal, Magic-UI | 517 palette, 66 hexes | 2 animations had never run |

- [x] **Order:** A merged first, then the rest.
      names not primitives. C through I start once A is merged. I may run alongside A.
- [x] **Coordination point between A and I.** The `components/ui/*` decorative components depend on
      custom keyframes in `tailwind.config.js`: `marquee`, `border-beam`, `shimmer-slide`,
      `spin-around`, plus `--duration`, `--speed` and `--gap` variables. Parcel A must preserve them
      verbatim or hand ownership to I. Rewriting the keyframes silently breaks all four.

### 2.4 Debt to clear while restyling

Found during the inventory. Each is cheap now and expensive later.

- [x] **Fix the broken `@apply` block in `globals.css`.** It applies `from-primary-light`,
      `bg-success-bg`, `bg-success-dark`, `bg-error-bg`, `text-error-text`, `bg-warning-bg` and
      `text-warning-text`. Those CSS variables exist in `:root` but were **never mapped into
      `tailwind.config.js`**, so the utilities do not exist and the pill and button classes are
      silently inert today. Parcel A fixes this.
- [x] **Adopt `cva`.** It is installed and imported **nowhere**. The primitives are its first use.
- [x] **Delete `app/(app)/qb-comparisons/page.old.tsx`**, 1,008 lines of dead code sitting in a route
      folder. Next.js will not route it, but a styling agent would burn a whole budget on it.
- [x] **Pick one radius.** `rounded-lg` appears 325 times and `rounded-xl` 119 times with no rule.
- [x] **Collapse five table-header systems into one.** There are at least five mutually inconsistent
      `<th>` recipes across the app.
- [x] **Decide the real primary colour.** The brand purple in `--primary` is barely used in
      classNames; `bg-blue-600` is the de-facto primary at 23 occurrences. The new brand is Indigo
      `#6366f1`, so this resolves itself, but every `blue-600` call site has to move.
- [x] **Resolve the duplicate legal pages** before styling both: `(public)/terms` versus
      `(public)/legal/terms`, and the same for privacy. **Done:** kept `(public)/terms` and
      `/privacy` — they are Kyriq-branded where the `/legal` pair still said "Cheque Extractor",
      they are what the footer linked to, and they are already in the proxy's public allowlist. The
      `/legal` pair redirects rather than 404s so links in the wild still land. All three documents
      now share one shell; the nav and prose recipe existed three times with three grey scales.
- [x] **Decide whether the two shells unify.** `(app)` has a dark sidebar, `(admin)` a light glass
      one. Parcel B owns both so the answer is consistent either way.
- [x] **Dark mode decided: not built now, and not left to rot.** The `.dark` block is kept but fully
      re-pointed at the new token names, with the glass alphas inverted to DepthMe's own values, so
      wiring a provider later is a provider change rather than a token rewrite. Nothing toggles it
      and no `dark:` prefix is used, which is the deliberate state.

### 2.5 Performance and QA

- [x] **Budget the blur.** `backdrop-filter` is expensive and the comparison grid renders hundreds of
      rows. Glass goes on containers and headers, never on individual rows. Test on the 428-check
      batch and watch frame rate.
- [x] **Rewire Recharts explicitly.** **Done:** `frontend/lib/charts.tsx` is the one palette and all
      four chart files declare no colour of their own, enforced by the check. Values are literals
      with the token named in a comment, not `var()` references — the tokens are hsl *components*,
      so `stroke="var(--brand)"` resolves to a non-colour and renders black. `ChartFrame` owns the
      sized wrapper and the `ResponsiveContainer`, so a bare one cannot be mounted and the
      collapse-to-zero-height bug is structurally impossible rather than merely avoided.
- [x] **Handle the 17 files using inline `style`.** They bypass Tailwind entirely and will drift.
      Highest risk are the ones doing dynamic width, transform or colour maths: upload progress, the
      process timeline and stage indicator, the check image viewer, comparison table column widths,
      and `MatchRow`.
- [x] **Dropzone drag states.** The drop target styles its active and reject states from hook
      booleans, so glassifying the resting state alone leaves the others looking broken.
- [x] **No hardcoded hex outside the token file**, and no raw palette utility — every parcel's check
      enforces this for its own files.
- [ ] **Every route at 1440px and 400px.** *Partly done, and this is the biggest unverified gap in
      the redesign.* Genuinely looked at: the landing page, all three legal pages and the four auth
      pages (they are public). Verified in harnesses against the real compiled CSS: the upload
      surfaces, the charts, and the billing/export/match components. **Not seen by anyone:**
      dashboard, process, review, QB comparisons, settings, and the admin pages — every app route
      redirects to `/login` and no credentials were created. Needs a test login, or migration 026
      applied so a comp account can be made.
- [ ] **Both themes** — not applicable yet. Dark mode is deliberately not built (see 2.4).

---

## 3. P1 — v17 core workflow

Structure from the v17 prototype, surface from section 2.

- [x] **Shell and navigation** per v17: Reconcile, History, Reports, Companies, Connections, Users,
      Settings, Billing, and the admin section.
- [x] **One `/reconcile` route** with a batch-driven stepper: Upload → Match → Review → Approve. Step
      state comes from the batch record, not from which page is open. Forward steps stay locked until
      the prior one is genuinely complete. In the prototype these are plain links and Approve is
      reachable from Upload.
- [x] **Match auto-advances.** The user does nothing there, so it is a progress screen that moves on
      by itself when matching finishes.
- [x] **Review merges QB Match and QB Comparisons** into three tabs: Needs Attention, 100% Matches,
      All Checks. Keep every existing row action (approve, remap, resolve, flag, note, edit in QB,
      create in QB, undo), keep the up-to-200-record view, and lose the spreadsheet look.
      *From: "I would like to get rid of the Excel look."*
- [x] **Side-by-side review modal** with the check image next to the QuickBooks record.
- [x] **Approve and Clear** page: batch summary, pre-flight checks, server-side validation before any
      write, bulk clear, audit entries.
- [x] **Continue Reconciliation card.** If someone closes Kyriq mid-flow, they resume exactly where
      they stopped with no re-upload and no re-approval. Shows company, account, period, step N of 4,
      and how many checks need attention. *Michael's mock: "ABC Construction LLC · Operating Checking
      / August 2026 / Step 3 of 4 — 24 checks need attention."*
- [x] **Remove the QB Match page** as a separate route.
- [x] **Remove the Analytics page**; its content moves into Firm Admin. **Done:** route and nav
      entry gone, nothing culled — KPIs, the per-engine breakdown, the job-status split and the
      empty state all moved. One deliberate consolidation: its Per-Document list was the same job
      rows as Firm Admin's Client Overview, keyed identically, so the extraction count became a
      column there and that table's slice rose from 10 to 15 to cover everything the list showed.
- [x] **Remove the matching-preferences panel** from Settings. **Correction: it never existed in
      the React app.** It is in the v12/v17 prototypes only — confirmed with `git log -S` over the
      file's full history — so there was nothing to delete. It is now pinned shut instead: a comment
      records why those six controls are absent and the check fails if any name reappears.
- [x] **Give the auto-approve threshold a home.** This half is real and is NOT done. There is no
      persisted threshold: the value is hard-coded as `score >= 95` in
      `frontend/lib/matching-algorithm.ts:235` and duplicated as a label on the qb-match page.
      It needs a settings key plus an endpoint, then that one literal rewired. Until then there is
      nothing for Review to put next to Approve All.
- [x] **Connect QuickBooks card inline on step 1** when no company is connected, so a new user never
      leaves the flow to go to Settings.
- [x] Sign-in button purple, matching the website.

---

## 4. P1 — company and account switchers

Build the design from `Kyriq_Switcher_Mockup.html` on the existing data layer, not on the client's
hook.

- [x] Move both switchers from the sidebar to the **top bar**.
- [x] **Company switcher:** avatar with initials, search, per-row connected or needs-reconnect
      status with account count, a checkmark on the active company, per-row disconnect behind a
      proper modal rather than `confirm()`, and "Add New Client" in the footer.
- [x] **Account switcher:** grouped into Bank Accounts and Credit Cards, each row showing name, last
      four, sub-type and balance, with a refresh action.
- [x] **Accounts need a real source.** Today `AccountSwitcher` builds strings from `qb_entries.account`
      with no type, balance or last four. Either add a `qb_accounts` table with `tenant_id` and RLS,
      or extend `pages/api/qbo/accounts.ts`, which is currently single-company and Bank-only.
- [x] Keep the active company **server-side** in `qb_connections.is_active`. The matching routes and
      the extension all read it; a localStorage-only switch would show company B while matching
      company A.
- [x] Show the pending-match count that already exists in `/api/qb/connections`.

---

## 5. P2 — roles, access and accounts

- [x] **Two roles: Administrator and User.** Users get no billing, no reports, no account editing.
      Enforced server-side and in RLS, not by hiding menu items. `profiles.role` already exists with
      admin/member/viewer. *From item 4 of the client list.*
- [x] **Build the four missing team endpoints.** `/settings/team` already calls `/api/team/members`,
      `/api/team/invite` and `/api/team/members/[id]` for DELETE and PATCH. None exist, so inviting a
      user currently fails silently. The `team_invitations` table, token and 7-day expiry are already
      in `supabase/migrations/001_schema.sql`.
- [x] **Invitation accept page** at a token URL. None exists.
- [x] **MFA.** Supabase Auth TOTP enrolment and challenge, required for Administrators. No MFA code
      exists today; it appears only in the legal pages.
- [x] **Comp accounts.** Super Admin grants a free account for a set period, with a reason and an
      expiry, written to the audit log. This is how the pilot firms get in.
      *From: "Make it possible for me (super Admin) to give free accounts."*
- [x] **Super Admin view** per the v17 billing doc: firm, plan, billing frequency, trial status and
      usage, subscription status, monthly usage, overage, payment status, paid-through date,
      cancellation status, Stripe IDs and links. Overrides, credits and refunds all logged.

---

## 6. P2 — signup, trial and abuse control

- [x] **Signup per `signup.html`:** **Done from CHECKLIST section 6 rather than the HTML, because
      the v17 zip is not in this repo.** All fields added, minimum raised 6 to 8 from one constant
      enforced in both the submit guard and `minLength`, required consent checkbox, plan picker
      removed, CTA reads "Create Account and Start Trial". Reset-password was raised to 8 to match —
      a reset accepting a shorter password is a hole in the policy. Inferred and worth a look: field
      order, the first/last name split, and the confirm-your-email copy. The
      current `/signup` has a plan picker, a 6-character minimum, no names and no consent.
- [x] **Public CTAs say "Start Free Trial"** and route to signup, never to login or a prototype page.
- [x] **Email verification on.** **Done in `supabase/config.toml`** — but that file governs local
      dev only, so it still has to be switched on in the HOSTED project, and custom SMTP must be in
      place first or confirmation mail fails silently at volume. Consequence already handled:
      `signUp` no longer returns a session, so the old unconditional redirect to `/dashboard` would
      have bounced every new user to `/login`; signup now shows a confirm-your-email panel.
- [x] **One trial per QuickBooks realm.** Michael asked how to stop people opening trials with
      multiple emails. The firm's QuickBooks company ID is the natural identity: verified email,
      plus one trial per realm, plus a disposable-domain block.
- [x] **Trial meter visible in-app:** days remaining and checks remaining.

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
- [x] Monthly plans through Checkout.
- [ ] **Annual through the Subscriptions API in flexible billing mode.** Annual base plus monthly
      metered overage is a mixed-interval subscription, and standard Checkout Sessions do not create
      one. The doc explicitly says not to present that limitation as a finished annual implementation.
- [x] Monthly allowance resets monthly for annual customers too. Not one annual pool.
- [x] **Renewal on the same date each month**, regardless of when someone subscribed.
      *From item 17 of the client list.*
- [x] **Eight webhooks**, signature-verified and processed idempotently: `checkout.session.completed`,
      `customer.subscription.created`, `.updated`, `.deleted`, `invoice.created`, `invoice.finalized`,
      `invoice.paid`, `invoice.payment_failed`.
- [x] **Paid access activates only after a verified webhook.** Never on a success-page redirect.
- [x] Billing page showing plan, frequency, base price, commitment and renewal terms, included
      checks, usage, remaining, overage quantity and estimate, period dates, paid-through date,
      status, invoice history, payment method, and controls to change plan, cancel renewal and
      reactivate.
- [x] Plan changes with charges, credits and effective dates disclosed before confirmation.
- [x] Payment failure: in-app warning, grace period, then processing restricted while history stays
      viewable, and automatic restoration on payment.
- [x] Cancellation: monthly ends at period end; annual disables renewal but runs to the paid-through
      date; reactivation before that date; incurred overages still payable.
- [x] Renewal reminder roughly 30 days before an annual charge.
- [x] Refunds require an authorised Super Admin action with a recorded reason.

---

## 8. P2 — usage ledger

The billing system is only as trustworthy as this table.

- [x] **Immutable ledger**, one row per successfully processed check, carrying firm, user, company,
      check, processing event, timestamp, billing period and the Stripe event reference.
- [x] **Count on success only.** Failed OCR does not count.
- [x] **Multiple checks on one page count individually.**
- [x] **Idempotency key per processing event** so automatic retries never double-count.
- [x] **Repeat uploads count again**, and the user is told first: warn that the file was uploaded on
      a given date and let them confirm it should be processed and counted.
      *From Michael, 30 September.*
- [x] **Count detected checks, not pages.** A 40-page bank statement containing 6 checks bills 6.
      This makes detection accuracy a billing-correctness issue, which is why section 10 matters.
- [ ] Reconcilable meter events submitted to Stripe; Kyriq stays the source of truth for check-level
      detail, Stripe for subscription state.

---

## 9. P2 — email

Full analysis in `docs/EMAIL-SPEC-REVIEW.md`.

- [ ] Resend on `updates.kyriq.com`, SPF, DKIM and DMARC before any sending. Sender
      `Kyriq <notifications@updates.kyriq.com>`, reply-to `support@kyriq.com`.
- [x] **Six emails whose triggers already exist:** invitation sent, accepted and expired, member
      removed, role changed, processing failed.
- [x] **Three QuickBooks emails need groundwork first.** `qb_connections` has no status column;
      `is_active` means "currently selected", not "healthy". Both token refresh paths currently write
      a log line and nothing else, so a dead connection is invisible until a user trips over it. Add
      the status column, write on failure in both paths, and add a scheduled health check.
- [x] **Ten trial and usage emails** once the ledger exists.
- [ ] **Four Stripe-native notices** configured with Kyriq branding, not rebuilt.
- [x] **Unsubscribe route and token before any non-transactional email.** The published privacy
      policy already tells users they can unsubscribe through a link or account settings. Neither
      exists, which is a compliance exposure the moment a digest or marketing email ships.
- [x] **Settle one wording conflict.** The email spec says "check uploads"; the website, FAQ and
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

- [x] **Wire up `_filter_check_backs()`** in `backend/check_extractor.py`. It already exists, analyses
      ink projection and the MICR strip, and is never called. **Done:** called in
      `detect_checks_on_page` after dedup, so endorsement backs stop being extracted as fronts.
- [x] **Add a confidence score per detected region** and reject low-confidence pages. Two paths
      currently emit false checks from ruled statement tables: the format-A branch falls back to grid
      boxes when contour detection finds none, and the auto-detect branch keeps both detector outputs
      when neither is confident. **Done:** `_region_confidence()` scores each region and a page needs
      one region at `REGION_CONFIDENCE_PAGE_MIN` to count at all. The decisive signal turned out to be
      the MICR band, and specifically its *structure*: a table rule along the bottom of a statement row
      puts as much ink in the strip as MICR does, so ink alone let false checks through. MICR fills most
      of the strip's rows (67% on the fixtures) where a rule inks a fifth (19%), so both are required.
      *ponytail:* thresholds are tuned on synthetic fixtures — validate against the 428-cheque batch
      and Michael's real statements before trusting the constants.
- [x] **Fix the format vote.** It samples only the first three pages, so a statement whose opening
      pages are text sets the wrong hint for the check pages that follow. **Done:** the sample is now
      spread evenly across the whole document, and — the part that actually mattered — only pages
      holding a confident cheque region get a vote. A ruled transaction table reads as a line-grid, so
      on a 40-page statement with 6 cheques a plain majority would have been decided by the 34 pages
      with no cheques on them. Returning None is a safe answer; the caller auto-detects per page.
- [x] **Per-page checkboxes** instead of the contiguous range, defaulted to pages where checks were
      found.
- [ ] Decide whether a downloadable checks-only PDF is wanted. Nothing in the stack can write a PDF
      today, so that needs a new library. Skipping the external tool may be the whole requirement.

---

## 11. P2 — Chrome extension

The client requires the extension to match the app in look and options.

- [x] **Restyle to the new brand and the glass system.** `sidepanel.css` is 1068 lines of plain CSS
      using QuickBooks green `#2CA01C` while the app uses navy. Port the tokens by hand here, plus
      `popup.css` and `qbo-overlay.css`.
- [x] **Match the approved `/extension` design:** header with company and account selectors, sync
      action, connection status, usage meter; tabs for Upload, Match, Review, Approve and History;
      Needs Attention chips for lower confidence, duplicates, discrepancies and no match;
      colour-coded cards.
- [x] **Open QuickBooks to the company the user is working on**, so they watch Kyriq clear each
      approved item. *From item 7 of the client list.*
- [ ] New logo in all icon sizes.
- [ ] Chrome Web Store listing: publisher **Kyriq**, contact `support@kyriq.com`, official URL
      `kyriq.com` verified in Search Console. The personal developer account can be ignored; it
      cannot be removed and does not appear on the listing.

---

## 12. P2 — website

Implement the approved redesign copy verbatim from
`kyriq-website-redesign.michael389314.chatgpt.site/website.html`.

- [x] Hero leading with the bank statement: *"Start with the bank statement you already download."*
      and *"Typed or handwritten—Kyriq can read both."*
- [x] Four-step section, three value cards, pricing with the monthly and annual toggle, the usage and
      overage explanation, and the annual terms block.
- [ ] **The 15-question FAQ**, verbatim. **Blocked, deliberately left empty.** The section, its
      accordion markup and the `FAQS` array exist and are wired; the component renders nothing while
      the array is empty, so nothing half-finished is public, and the check fails on any count other
      than 0 or 15. The source is the v17 zip and the client's redesign site, neither in this repo.
      Fabricating fifteen answers about billing and data handling would be worse than an empty slot.
- [x] **Remove** the watch-demo button, "trusted by 500+ accounting firms", and all testimonials.
      *From item 1 of the client list.* **Done — plus one nobody asked for:** the stats bar claiming
      "98% accuracy" and "0 missed checks per month" was unverifiable in exactly the same way, so it
      went too, replaced with facts we can stand behind (14-day trial, 250 trial checks, 4 steps).
      Flagging it because it was not on the client's list.
- [x] Every CTA routes to `/signup`.
- [ ] Real logo and brand colours. **Colours done** — Indigo `#6366f1` and Emerald `#10b981` from
      the tokens, not the prototype's placeholders. **Logo still blocked** on the missing pack.
- [x] Note on every plan that the Chrome extension is included.

---

## 13. P2 — history, reports, retention

- [x] **Batches table.** History needs a real batch record; the app only has jobs today. The stepper
      and the Continue Reconciliation card also depend on it.
- [x] **History page:** past batches with approver, status and export.
- [ ] **Reports page** with date, company and account filters.
- [ ] **Firm Admin** absorbing the Analytics content.
- [x] **Upload retention.** Delete uploaded files 14 days after a reconciliation completes, keeping
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

## 15b. Found while building — not in the original plan

Each of these was discovered during implementation and is recorded because none
of it was visible from the documents.

- [x] **`public.app_settings` is readable with the public anon key.** Verified
      live: a plain `GET /rest/v1/app_settings?select=*` returns the row,
      including `gemini_api_key`, `qbo_access_token` and `qbo_refresh_token`. The
      anon key ships in the frontend bundle *and* in the extension's
      `BOOTSTRAP_CONFIG`, so that means any visitor or extension user. Those
      three columns are currently NULL, so nothing is exposed yet — but the live
      save-settings endpoint in `backend/api_server.py` writes `gemini_api_key`
      into that exact row, so the first key saved through Settings becomes
      public. Migration 009 meant to enable RLS here and was never applied.
      Closed by **migration 031**, deliberately standalone so it can go out
      without the rest of 030. *Still open until 031 is applied.*
- [x] **The same endpoint printed the API key to the server log** on every save
      (`print(f"   Data: {update_data}")`). Now redacted to field names and
      value lengths.
- [x] **No glass surface was actually blurring.** Turbopack's CSS minifier
      (lightningcss) collapsed every `backdrop-filter` / `-webkit-backdrop-filter`
      pair down to the prefixed form alone, and prefix-only computes to
      `backdrop-filter: none` in Chrome — verified in Chrome 152. So the whole
      design system's defining effect was absent, every surface rendering as a
      flat tint. The `@supports` fallback could not catch it either: the browser
      *does* support the property, the declaration had simply been deleted, so
      the surfaces got neither the blur nor the raised-opacity fallback. Fixed by
      authoring the pair prefix-first, which is how Tailwind's own
      `backdrop-blur` utilities survive the same minifier.
      `scripts/check-primitives.ts` now asserts the order.
- [x] **The `npm run lint` gate was inert.** The script was `next lint`; Next 16
      removed that command, so it parsed `lint` as a directory and exited 0
      having linted nothing. There was also no ESLint config anywhere in
      `frontend/`. So the quality gate in section 0 has never linted this
      codebase. Wired up to real eslint: 0 errors, 107 warnings. The three real
      errors it surfaced are fixed:
      - `CompanySwitcher`'s **"Connect QuickBooks" and "Add Company" never
        worked** — both were `<a href="/api/qbo/auth">`, and that route answers
        with `{authUrl}` as JSON rather than redirecting, so each navigated the
        user to a raw JSON document. Now fetch-then-redirect, matching Settings.
      - `DetailModal` called `useMemo` after `if (!row) return null`, so when the
        row cleared React saw fewer hooks than the previous render and threw.
- [x] **Migration 001 was never fully applied to the live database.**
      `team_invitations`, `profiles` and `tenant_settings` do not exist, and
      `audit_logs` has different columns than 001 declares. The migrations folder
      is therefore not a record of this database's shape. 030 was written against
      what is actually there (it *creates* `team_invitations` rather than
      assuming it), but this is worth knowing before trusting any migration file
      as documentation.
- [x] **Four `shadow-glass-*` utilities never rendered.** `glass-panel`, `glass-modal`,
      `glass-toast` and `glass-selected` each existed as BOTH a `boxShadow` key and a colour, so
      Tailwind emitted two rules per class and the shadow-colour rule won by source order. The
      colliding colour entries were used nowhere, so removing them fixed all four with no call-site
      churn. `check-primitives.ts` now cross-references both maps.
- [x] **Every `className` override of a custom theme key silently did nothing.** `tailwind-merge`
      only knows Tailwind's stock scales, so `cn("min-h-btn", "min-h-0")` returned *both* and the
      primitive won. 34 keys were affected. Found by a parcel measuring a table row in a browser —
      it had written a compact-toolbar override, got a 44px button anyway, and the row grew 11.5px.
      Another parcel used the same override in ~8 places believing it worked. `lib/utils.ts` now
      configures `extendTailwindMerge`, and the check derives its probes from the config itself.
- [x] **`BorderBeam` had never animated.** It set `--duration: "12s"` while the Tailwind animation
      reads `calc(var(--duration) * 1s)`, so it resolved to `calc(12s * 1s)` — invalid, silently
      dropped, beam frozen since it was written. `ShimmerButton` had no call site at all, so its
      animation had never run on the site either.
- [x] **The billing page was showing invented invoice history.** It grouped jobs by month, used
      Kyriq's internal API cost as the "amount", and stamped every prior month `Paid` from its array
      index. No payment record exists behind any of it. Now labelled as processing usage, badged
      "Not invoices", with the six fields that have no data source shown as pending rather than
      filled with plausible values.
- [x] **At 400px, MatchRow clipped every row action out of reach.** Its grid needed 534px inside an
      `overflow-hidden` container, so the whole QuickBooks column and all the row actions were
      unreachable with no scrollbar to find them.
- [x] **Three Recharts bugs that source, type-check and build all passed:** `AreaFade` written as a
      component, so Recharts filtered the `<defs>` out and every area chart rendered as a bare
      stroke with no fill; pie labels inheriting the slice fill at 2.1:1; and outside pie labels
      running off the card at 375px.
- [x] **`/api/qbo/auth` is not a redirect.** It answers with `{authUrl}` as JSON, so the company
      switcher's `<a href>` "Connect QuickBooks" and "Add Company" navigated the user to a raw JSON
      document. Neither had ever worked. Surfaced by turning the lint gate on.

- [x] **Eleven separate copies of the QuickBooks token refresh**, and they have already
      drifted. Every one of these carries its own `grant_type: 'refresh_token'` exchange:
      `lib/match-helpers.ts`, `pages/api/extension/qb/refresh-token.ts`, and
      `pages/api/qbo/{accounts,clear-transaction,company-info,create-check,diagnose,explore,preview,pull-checks,update-transaction}.ts`.
      Two concrete drifts, both of them this repo's own named non-negotiables:
      **four never read `qb_connections` at all** (`accounts`, `company-info`, `explore`,
      `preview` read only the legacy `integrations` table, so they silently operate on the
      wrong company for any firm with more than one connected), and **only two of eleven trim
      their credential values** — a trailing space in a client secret fails OAuth in a way that
      reads as a bad credential. CLAUDE.md also requires a refresh to update both token stores;
      not all of them do. One shared resolver, then migrate the call sites. The health-write
      helper is being created as part of section 9 so there is one function to call rather than
      eleven chances to forget.
- [x] **`pages/api/qbo/accounts.ts` cannot back the account switcher** (section 4). It queries
      `WHERE AccountType = 'Bank'`, so credit cards are invisible; it reads `integrations`, so it
      is single-company; and it returns no last four. Section 4 wants accounts grouped into Bank
      and Credit Card with name, last four, sub-type and balance.

- [ ] **Blocked on assets that never reached the repo.** The logo pack
      (*Kyriq Logo — All Source files — 12 versions.zip*) is absent, so versions 1
      and 7 cannot be shipped. `Kyriq-Developer-Handoff-v17.zip` is absent too —
      only v12 is extracted — so `STRIPE-BILLING-REQUIREMENTS.md`, the new
      `signup.html` and the updated `website.html` are unavailable. The decisions
      are captured in this checklist, so Stripe is not blocked, but the
      **15-question FAQ and the verbatim website copy are**.
- [ ] **Migrations 026–031 are unapplied.** *Re-checked 6 Oct: still unapplied.* An anon-key probe
      shows `usage_ledger`, `comp_grants`, `upload_fingerprints`, `team_invitations` and
      `mfa_recovery_codes` all absent, and `app_settings` still returning a row to the public key. There is no way to run DDL from the
      build environment: no `psql`, no linked Supabase CLI, no database password
      or access token, and no SQL-executing RPC. Until they are applied the usage
      ledger, trial enforcement, comp accounts, the team endpoints and MFA
      recovery all fail at the database, and the `app_settings` hole stays open.
      Needs either a `SUPABASE_DB_URL`, a `SUPABASE_ACCESS_TOKEN`, or someone
      running them in the SQL editor.

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
