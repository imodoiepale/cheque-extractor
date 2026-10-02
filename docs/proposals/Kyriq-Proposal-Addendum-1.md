# Kyriq proposal, addendum 1

Covers two items requested after the original proposal. The agreed scope and price for Phase 1 and Phase 2 are unchanged.

Issued 2 October 2026.

---

## Revised totals

| Item | Days | Cost (USD) |
|---|---|---|
| Phase 1: core workflow (shell, stepper, review consolidation, Approve and Clear) | 2 | $500 |
| Phase 2: companies, connections, users and roles, Stripe billing, history, reports, firm admin | 3 to 5 | $700 |
| Phase 3: operational and billing emails | 2 | $450 |
| Bank statement handling: detection accuracy and per-page selection | 1 | $150 |
| **Total** | **9** | **$1,800** |

Each phase is invoiced on delivery. Phases 3 and the bank statement item are optional and can be dropped without affecting the first two.

---

## Phase 3: emails

Covers the email specification supplied on 23 September. Full analysis is in `docs/EMAIL-SPEC-REVIEW.md`.

**Included at $450**

- The six operational emails whose triggers already exist in the database: team invitations (sent, accepted and expired), member removed, role changed, and processing failed.
- The three QuickBooks emails (connected, needs attention, disconnected). These need a connection health status stored against each QuickBooks company first, because nothing records it today. A failed token refresh currently writes a log line and nothing else, so a dead connection is invisible until a user trips over it. This includes a scheduled health check, which is worth having whether or not the emails ship.
- The four Stripe-native billing notices (payment successful, payment failed, refund issued, payment method expiring), which need configuring with Kyriq branding rather than building.
- Resend account setup, sending domain authentication (SPF, DKIM and DMARC on the sending subdomain), custom SMTP wired into the login system, and the send infrastructure every later email reuses.
- Building the missing team invitation endpoints. The Team settings page already exists but its four API calls were never built, so inviting a user currently fails. The database table, token and expiry are already there.

The price moved from an initial $350 estimate because connection health is not tracked today. That was found during the detailed review.

**Included in the existing Phase 2 price, not charged again**

The ten trial and usage emails depend on a trial clock and a per-period check counter. That counter is already part of the Phase 2 Stripe work, so these emails are folded into that line at no extra cost.

**Not included, available later**

| Email | Why it is out | Reason |
|---|---|---|
| New login alert | Needs device fingerprinting and IP geolocation, neither of which the auth provider supplies | Quoted separately on request |
| Report ready | Needs the Reports page to exist first | Follows Phase 2 |
| Support request received | Needs a support ticket system | Not currently planned |
| Company added | Duplicates the QuickBooks connected email unless the two-step company model is built | Depends on decision 4 below |

**Seven decisions block parts of this work.** They are listed in section 7 of the review document. The two that block the most are the trial allowance (200 or 250 checks, which two documents currently disagree on) and the per-check overage rate, which seven emails reference but which has never been set.

**One item to raise separately.** The published privacy policy already tells users they can unsubscribe from marketing emails via a link or through account settings. Neither exists. This is not a problem while only transactional email is sent, but it needs building before any marketing or digest email ships. Flagged here because it is a compliance point rather than a feature request.

---

## Bank statement handling

Most of this already works. The pipeline rasterises a PDF page by page, runs check detection on each page independently, returns a per-page check count, and already lets the user restrict extraction to a page range before any OCR runs. A page with no checks is skipped rather than erroring.

So a full bank statement can be uploaded today and Kyriq will find the check pages. The external step of cutting a checks-only PDF first is not strictly required already.

**What the $150 buys**

- Wiring up detection safeguards that are already written but never called.
- A confidence score per detected region, so statement pages with ruled tables stop producing false-positive checks. Two code paths currently allow this.
- Per-page checkboxes in place of the contiguous range, defaulted to the pages where checks were found.
- Fixing the document-format vote, which currently samples only the first three pages and so misreads a statement whose opening pages are text.

**Why this matters beyond convenience.** Usage is to be counted on checks detected. A false-positive detection on a statement page would therefore overbill a real customer. The accuracy work and the billing meter are the same problem, which is why this is worth doing before launch rather than after.

**Not included.** Producing a downloadable checks-only PDF. Nothing in the current stack can write a PDF, so that needs a new library. Worth confirming whether that file is actually wanted, or whether skipping the external tool is the whole requirement.
