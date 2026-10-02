# Kyriq email specification: review and build plan

Review of the two email specifications (Operational + Account, 18 emails; Stripe + Resend, 24 emails) against the Kyriq codebase as it stands.

Prepared 2 October 2026.

---

## Summary

The copy is good and does not need rewriting. The tone is consistent across both documents, the terminology discipline in section 3 of the billing spec is genuinely useful, and the split between Stripe-native and Kyriq-branded emails is correct.

Everything below is structural: things two documents disagree on, things the app cannot currently trigger, and prerequisites the specs assume but do not name.

Three numbers worth knowing up front:

| | Count |
|---|---|
| Emails whose trigger data already exists in the database | 9 |
| Emails that are Stripe-native, so configuration only | 4 |
| Emails blocked on a trial clock and usage counter that do not exist yet | 10 |

---

## 1. Starting position

There is no email infrastructure in the application today. Verified:

- No Resend, nodemailer, SendGrid or Postmark in any `package.json`.
- No Stripe library either.
- No `/api/team/*` routes exist, so the existing Team settings page is already non-functional.
- `supabase/config.toml` has `enable_confirmations = false`, so no verification email is sent at signup today.

So every Kyriq-branded email in both documents is net-new sending. What varies is whether the *event* that should trigger it is already recorded.

---

## 2. What already has its trigger data

These nine can be wired as soon as a sender exists, because the database already records the event. All tables are in `supabase/migrations/001_schema.sql`.

| Email | Existing trigger |
|---|---|
| 01 Team invitation | `team_invitations` table, with token and expiry |
| 02 Invitation accepted | `team_invitations.status` → accepted |
| 03 Invitation expired | `team_invitations.expires_at` |
| 09 Team member removed | `profiles` row removal |
| 10 Role changed | `profiles.role`, already admin / member / viewer |
| 11 QBO connected | `accounting_connections.status` → active |
| 12 QBO needs attention | `accounting_connections.status` → expired or error |
| 13 QBO disconnected | `accounting_connections.status` → revoked |
| 14 Processing failed | `check_jobs.status` → error, with `error_message` |

An `audit_logs` table also already exists and can carry the security trail behind emails 05, 07 and 08.

---

## 3. What has no trigger data

Ten of the 24 billing emails (01 to 06, and 08 to 11) depend on two things that do not exist: a trial clock and a per-period count of checks processed.

The `tenants` table carries a plan name only. There is no trial end date, no checks-used counter, and no billing period.

One clarification worth making, because the names are similar. The app does already track API usage, added in migration 012. That records what Kyriq **pays** Google and OpenAI per extraction. It is not a record of what the customer **owes**. The customer-facing meter is new work, and it is the reason those ten emails cannot be scheduled independently of the Stripe build.

---

## 4. Conflicts to resolve

Listed heaviest first. Items 1 to 3 are decisions only Kyriq can make; the rest are implementation points.

### 4.1 Trial size: 200 or 250 checks

The prototype website says "Two-week trial · Up to 200 checks · No credit card required". Billing spec section 3 says "14 days or 250 check uploads", and 250 is written into the locked copy of emails 01, 02, 03 and 05, with trigger thresholds at 125 and 200.

One of the two documents has to change. If the answer is 200, four pieces of locked copy need reissuing.

### 4.2 Overage is referenced everywhere but priced nowhere

Seven emails (07, 08, 09, 10, 11, 17, 18) tell the customer that additional checks are billed at `{{overage_rate}}` per check. The prototype pricing page states no overage rate at all, and the only related line is that a re-uploaded check counts again.

This is the single biggest blocker in the specification. It needs a per-check overage rate for each plan before any of those seven emails can be sent, and before Stripe metering can be configured.

Related and worth stating explicitly somewhere: the trial **hard stops** at the allowance (emails 05 and 06 tell the customer to choose a plan to continue), while paid plans **never stop** and roll into overage (emails 09, 10, 11). That asymmetry is sensible and probably intentional, but it is not written down as a rule anywhere, and whoever builds it needs to know.

### 4.3 Annual billing does not exist yet

Email 19 and billing spec section 3 both promise "one month free compared with paying monthly for the same plan over 12 months". The prototype has no annual prices and no monthly/annual toggle anywhere.

Three annual prices need setting, plus the toggle on the pricing page and in checkout.

### 4.4 Emails 11 and 17 will both fire for the same action

In the application as it stands, a company **is** a QuickBooks connection. Adding a company and connecting QuickBooks are the same event, so one completed OAuth would send both "QuickBooks Online is connected" and "{{company_name}} was added to Kyriq".

They only separate if the prototype's two-step model is built, where a firm creates a Kyriq company first and connects QuickBooks to it afterwards. Either build that, or drop one of the two emails.

### 4.5 Signup fires two or three emails at once

Operational 06 (verify email) and Billing 01 (trial started) both fire at account creation. If the person was invited, Operational 01 arrived as well.

More importantly, Billing 01 must fire **once per firm, not once per user**. Otherwise every invited team member receives a "your 14-day trial is ready" email for a firm that is already on a paid plan. The specification does not currently say this.

### 4.6 Turning on email 06 changes the signup flow

Email confirmations are disabled today, which is why signup currently goes straight to the dashboard. Enabling verification puts a gate in front of first use and delays the moment the trial becomes usable.

That is a product decision, not a template change. The alternative is to leave confirmations off and drop email 06.

### 4.7 "Counted when uploaded" needs a precise definition

Billing spec section 3 says a check counts when it is uploaded, and the QA checklist says counters are based on checks uploaded rather than matched or approved.

For a PDF, the number of checks is not known at upload. It is produced by detection during the analyze step. So "uploaded" has to mean "detected during analysis", and that should be stated.

This matters more than it looks, and it connects directly to the bank statement question. If someone uploads a 40-page bank statement and Kyriq finds 6 checks, they must be billed for 6, not 40. It also means detection accuracy becomes a billing-correctness issue: a false-positive detection on a statement page would overbill a real customer.

### 4.8 "A re-uploaded check counts again" contradicts how the app behaves

The upload endpoint already detects duplicate files by checksum and returns the existing job instead of reprocessing. So in the normal case, re-uploading the same file does **not** create new usage, which is the opposite of what email 10 tells the customer.

It is worse than a simple contradiction. The duplicate check runs against jobs held in memory, not against the database, so after a backend restart the same file does create a new job. The same customer action would be billed differently depending on when it happened.

Either reword the rule, or make duplicate handling deterministic and database-backed. The second is the better fix and is small.

### 4.9 Email 15 says "batch", the app says "job"

Operational spec section 2 requires app and email terminology to match. The application has jobs, one per uploaded document. There is no batch record. The reconciliation history work already identified that a batch concept needs creating; until it exists, email 15 should use the document name, which it already does via `{{upload_name}}`.

### 4.10 "Meaningful batch" is undefined, and there is no preference store

The matrix sends email 15 when a "meaningful" batch completes and the email preference is enabled, while A1 keeps routine completion in the app. The boundary between the two is not specified, and there is no notification preferences table to hold the opt-out.

Both need defining: a threshold, and somewhere to store the toggle.

### 4.11 Email 07 sits alongside the provider flow, not instead of it

Supabase confirms an email change by writing to both the old and new address. The instruction not to send provider templates in parallel should not be read as disabling that confirmation, which is a security control rather than a notification.

Email 07 is an additional after-the-fact notice. Worth stating so the wrong thing does not get switched off.

### 4.12 Email 22 refers to account terms that do not exist

"Paid processing access will stop according to your account terms" implies a stated data-retention policy after cancellation. There isn't one. The prototype's admin view mentions a 30-day retention job, but no retention setting exists and nothing in the terms covers it.

This is a legal item as much as a product one.

### 4.13 Email 08 is the most expensive single item in either document

A new-login alert needs device fingerprinting and approximate geolocation. Supabase Auth provides neither. Building it means a known-devices table, a fingerprint captured at sign-in, and an IP geolocation service.

The specification's own implementation note already hedges on the location line. Recommend deferring this one.

---

## 5. Prerequisites the specifications do not name

- **DNS before any sending.** SPF, DKIM and DMARC records on `updates.kyriq.com`. This needs doing early because propagation takes time.
- **A Resend account.** Not currently set up.
- **Custom SMTP wired into Supabase**, so emails 04 and 06 go out with the approved copy rather than the provider defaults.
- **Stripe retry configuration.** Email 14 triggers "after the retry window", which requires Smart Retries configured and a webhook keyed on either attempt count or subscription status.

---

## 6. Recommended phasing

**Build now, alongside the current work**

The nine emails in section 2, whose triggers already exist, plus the four Stripe-native notices (12, 13, 23, 24) which need configuration rather than code. This covers every invitation, every QuickBooks connection state, processing failures, and all official billing documents.

**Build with the Stripe and usage work**

The ten trial and usage emails (billing 01 to 06 and 08 to 11). These are blocked on the usage counter, and the counter is already part of the billing build, so they belong together.

**Defer**

- 08 New login alert, for the reasons in 4.13.
- 16 Report ready, which needs the Reports page first.
- 18 Support request received, which needs a support ticket system.
- 17 Company added, unless the two-step company model from 4.4 is built.

---

## 7. Decisions needed from Kyriq

1. Trial allowance: 200 or 250 checks.
2. Overage rate per check, for each plan.
3. Annual prices for each plan, or confirmation that annual billing is dropped for now.
4. Whether to build the two-step company model, or drop email 17.
5. Whether to require email verification at signup, or drop email 06.
6. How a re-uploaded file should be treated for billing.
7. Data retention period after cancellation.
