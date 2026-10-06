<!-- converted from Kyriq_Stripe_Resend_Email_Specification.docx -->

KYRIQ
Stripe + Resend
Email Specification
Production-ready customer communications for billing, trials, usage, account access, and subscription events


# 1. Developer Instructions — Read First
LOCKED COPY — DO NOT REWRITE
The subject lines, body copy, CTA text, and customer-facing terminology in this document are approved Kyriq production copy. Do not rewrite, shorten, paraphrase, “improve,” or replace them with default Stripe, Resend, framework, or developer-written wording.
Developers may map variables, add the required HTML structure, insert the Kyriq logo, create responsive formatting, and make technical changes needed for reliable delivery. Any proposed wording change must be approved by Kyriq before production.
# 2. What Sends From Where
Use three labels consistently in implementation. “Stripe” means Stripe sends the customer email natively. “Kyriq → Resend” means the Kyriq application decides when the message should be sent and calls Resend to deliver the branded email. Kyriq itself is the product/triggering system; Resend is the delivery provider.
# 3. Sending Identity & Terminology
• Automated branded email From: Kyriq <notifications@updates.kyriq.com>
• Reply-To / customer help: support@kyriq.com
• Do not send automated billing messages from michael@kyriq.com or developer@kyriq.com.
• Use “checks uploaded,” “included checks,” “additional checks,” and “overage” consistently. Do not substitute “credits,” “tokens,” “usage units,” or “documents.”
• A check counts toward usage when it is uploaded, including a check uploaded again. Do not imply that only successfully matched checks count.
• Trial allowance: 14 days or 250 check uploads, subject to the configured trial rules.
• Annual billing messaging: one month free compared with paying the same plan monthly for 12 months.
# 4. Implementation Matrix

# 5. Approved Email Copy
For all KYRIQ → RESEND emails below, use the sending identity in Section 3 and the exact wording shown.
## 01. Trial started
SEND VIA: Kyriq → Resend    |    TRIGGER: Account/trial created
Subject: Welcome to Kyriq — your 14-day trial is ready
CTA: Start reconciling → {{app_link}}
APPROVED BODY COPY

## 02. Trial 50% usage
SEND VIA: Kyriq → Resend    |    TRIGGER: 125 trial checks uploaded
Subject: You’re halfway through your Kyriq trial allowance
CTA: Continue in Kyriq → {{app_link}}
APPROVED BODY COPY

## 03. Trial 80% usage
SEND VIA: Kyriq → Resend    |    TRIGGER: 200 trial checks uploaded
Subject: Your Kyriq trial allowance is getting close
CTA: View your usage → {{usage_link}}
APPROVED BODY COPY

## 04. Trial ending soon
SEND VIA: Kyriq → Resend    |    TRIGGER: 3 days before trial end
Subject: Your Kyriq trial has 3 days remaining
CTA: Choose your plan → {{billing_link}}
APPROVED BODY COPY

## 05. Trial allowance reached
SEND VIA: Kyriq → Resend    |    TRIGGER: 250 trial checks uploaded
Subject: You’ve reached your Kyriq trial allowance
CTA: Choose your Kyriq plan → {{billing_link}}
APPROVED BODY COPY

## 06. Trial ended
SEND VIA: Kyriq → Resend    |    TRIGGER: Trial ends without paid activation
Subject: Your Kyriq trial has ended
CTA: Continue with Kyriq → {{billing_link}}
APPROVED BODY COPY

## 07. Paid plan activated
SEND VIA: Kyriq → Resend    |    TRIGGER: Subscription becomes active
Subject: Your Kyriq plan is active
CTA: Open Kyriq → {{app_link}}
APPROVED BODY COPY

## 08. Monthly usage 75%
SEND VIA: Kyriq → Resend    |    TRIGGER: 75% included checks used
Subject: A quick Kyriq usage update
CTA: View usage → {{usage_link}}
APPROVED BODY COPY

## 09. Monthly usage 90%
SEND VIA: Kyriq → Resend    |    TRIGGER: 90% included checks used
Subject: You’re getting close to your Kyriq plan allowance
CTA: View usage → {{usage_link}}
APPROVED BODY COPY

## 10. Included allowance reached
SEND VIA: Kyriq → Resend    |    TRIGGER: 100% included checks used
Subject: You’ve reached your included Kyriq check allowance
CTA: View usage → {{usage_link}}
APPROVED BODY COPY

## 11. Overage started
SEND VIA: Kyriq → Resend    |    TRIGGER: First additional check in cycle
Subject: Kyriq overage processing is now active
CTA: View usage → {{usage_link}}
APPROVED BODY COPY

## 12. Payment successful
SEND VIA: STRIPE    |    TRIGGER: Invoice/payment succeeds
Implementation rule: Use Stripe for the official successful-payment receipt/invoice. Do not send a duplicate “payment successful” receipt through Resend. Configure Kyriq branding, support details, and customer-facing business identity in Stripe.
CUSTOMER-FACING COPY: Use the Stripe template/receipt content for the official financial notice; keep Kyriq branding and terminology consistent. Do not create developer-written substitute copy.
## 13. Payment failed — first notice
SEND VIA: STRIPE    |    TRIGGER: Stripe payment attempt fails
Implementation rule: Use Stripe’s native failed-payment/billing communication for the first failed attempt. Do not duplicate it through Resend. Kyriq’s branded follow-up is Email 14 only if the balance remains unresolved.
CUSTOMER-FACING COPY: Use the Stripe template/receipt content for the official financial notice; keep Kyriq branding and terminology consistent. Do not create developer-written substitute copy.
## 14. Payment still unresolved
SEND VIA: Kyriq → Resend    |    TRIGGER: Payment remains unpaid after retry window
Subject: Action needed to keep your Kyriq account current
CTA: Update payment method → {{billing_portal_link}}
APPROVED BODY COPY

## 15. Access restricted for billing
SEND VIA: Kyriq → Resend    |    TRIGGER: App applies billing restriction
Subject: Your Kyriq access needs attention
CTA: Update billing → {{billing_portal_link}}
APPROVED BODY COPY

## 16. Payment restored
SEND VIA: Kyriq → Resend    |    TRIGGER: Past-due account returns to active
Subject: You’re all set — your Kyriq billing is current
CTA: Open Kyriq → {{app_link}}
APPROVED BODY COPY

## 17. Plan upgraded
SEND VIA: Kyriq → Resend    |    TRIGGER: Upgrade effective
Subject: Your Kyriq plan has been upgraded
CTA: Open Kyriq → {{app_link}}
APPROVED BODY COPY

## 18. Plan downgrade scheduled
SEND VIA: Kyriq → Resend    |    TRIGGER: Downgrade scheduled
Subject: Your Kyriq plan change is scheduled
CTA: View billing → {{billing_link}}
APPROVED BODY COPY

## 19. Monthly to annual
SEND VIA: Kyriq → Resend    |    TRIGGER: Annual switch confirmed
Subject: You’re now on annual Kyriq billing
CTA: View billing → {{billing_link}}
APPROVED BODY COPY

## 20. Cancellation scheduled
SEND VIA: Kyriq → Resend    |    TRIGGER: Cancel at period end
Subject: Your Kyriq cancellation is scheduled
CTA: Keep my Kyriq subscription → {{reactivate_link}}
APPROVED BODY COPY

## 21. Cancellation reversed
SEND VIA: Kyriq → Resend    |    TRIGGER: Scheduled cancellation removed
Subject: Your Kyriq subscription will continue
CTA: Open Kyriq → {{app_link}}
APPROVED BODY COPY

## 22. Subscription ended
SEND VIA: Kyriq → Resend    |    TRIGGER: Subscription actually terminates
Subject: Your Kyriq subscription has ended
CTA: View Kyriq → {{account_link}}
APPROVED BODY COPY

## 23. Refund issued
SEND VIA: STRIPE    |    TRIGGER: Refund completed
Implementation rule: Use Stripe for the official refund communication/receipt. Do not send a second refund receipt through Resend unless Kyriq later adds a separate customer-service message for a specific reason.
CUSTOMER-FACING COPY: Use the Stripe template/receipt content for the official financial notice; keep Kyriq branding and terminology consistent. Do not create developer-written substitute copy.
## 24. Payment method expiring
SEND VIA: STRIPE    |    TRIGGER: Stripe identifies expiring card
Implementation rule: Use Stripe’s supported expiring-payment-method notice when available/configured. Do not create a competing Resend version.
CUSTOMER-FACING COPY: Use the Stripe template/receipt content for the official financial notice; keep Kyriq branding and terminology consistent. Do not create developer-written substitute copy.
# 6. Shared Variables
# 7. Final QA Checklist Before Production
☐ Every email is mapped to exactly one primary delivery path: STRIPE or KYRIQ → RESEND.
☐ No Stripe event is duplicated by a Resend email unless this specification explicitly calls for a later branded follow-up.
☐ All Resend messages use Kyriq <notifications@updates.kyriq.com> and Reply-To support@kyriq.com.
☐ Domain authentication is complete before production sending.
☐ All variables render correctly; no raw {{variable}} placeholders can reach a customer.
☐ CTA links are generated for the correct customer and environment.
☐ Trial and usage counters are based on checks uploaded, not only matched or approved checks.
☐ Re-uploaded checks count toward usage if that is the configured Kyriq billing rule.
☐ Test monthly, annual, overage, failed-payment, cancellation, reactivation, refund, and trial-limit paths in sandbox/test mode.
☐ Do not enable overlapping default application emails that duplicate the approved messages in this document.

END OF APPROVED SPECIFICATION
| Status | APPROVED CUSTOMER-FACING COPY |
| --- | --- |
| Primary delivery | Kyriq application via Resend |
| Billing system | Stripe |
| Brand voice | Clear • confident • helpful • consistent |
| Label | Use for | Customer sees | Rule |
| --- | --- | --- | --- |
| STRIPE | Official billing documents and Stripe-hosted billing notices | Kyriq billing identity configured in Stripe | Do not duplicate the same event through Resend. |
| KYRIQ → RESEND | Trial, usage, onboarding, subscription-status, and branded billing communications | Kyriq <notifications@updates.kyriq.com> | Use exact copy in this document. |
| KYRIQ APP | In-app banners/toasts/status messages | Kyriq UI | Use the same terminology as the emails; do not invent alternate terms. |
| # | Email | Send via | Trigger | Subject |
| --- | --- | --- | --- | --- |
| 01 | Trial started | Kyriq → Resend | Account/trial created | Welcome to Kyriq — your 14-day trial is ready |
| 02 | Trial 50% usage | Kyriq → Resend | 125 trial checks uploaded | You’re halfway through your Kyriq trial allowance |
| 03 | Trial 80% usage | Kyriq → Resend | 200 trial checks uploaded | Your Kyriq trial allowance is getting close |
| 04 | Trial ending soon | Kyriq → Resend | 3 days before trial end | Your Kyriq trial has 3 days remaining |
| 05 | Trial allowance reached | Kyriq → Resend | 250 trial checks uploaded | You’ve reached your Kyriq trial allowance |
| 06 | Trial ended | Kyriq → Resend | Trial ends without paid activation | Your Kyriq trial has ended |
| 07 | Paid plan activated | Kyriq → Resend | Subscription becomes active | Your Kyriq plan is active |
| 08 | Monthly usage 75% | Kyriq → Resend | 75% included checks used | A quick Kyriq usage update |
| 09 | Monthly usage 90% | Kyriq → Resend | 90% included checks used | You’re getting close to your Kyriq plan allowance |
| 10 | Included allowance reached | Kyriq → Resend | 100% included checks used | You’ve reached your included Kyriq check allowance |
| 11 | Overage started | Kyriq → Resend | First additional check in cycle | Kyriq overage processing is now active |
| 12 | Payment successful | STRIPE | Invoice/payment succeeds | Stripe receipt/invoice subject configured in Stripe |
| 13 | Payment failed — first notice | STRIPE | Stripe payment attempt fails | Stripe failed-payment email |
| 14 | Payment still unresolved | Kyriq → Resend | Payment remains unpaid after retry window | Action needed to keep your Kyriq account current |
| 15 | Access restricted for billing | Kyriq → Resend | App applies billing restriction | Your Kyriq access needs attention |
| 16 | Payment restored | Kyriq → Resend | Past-due account returns to active | You’re all set — your Kyriq billing is current |
| 17 | Plan upgraded | Kyriq → Resend | Upgrade effective | Your Kyriq plan has been upgraded |
| 18 | Plan downgrade scheduled | Kyriq → Resend | Downgrade scheduled | Your Kyriq plan change is scheduled |
| 19 | Monthly to annual | Kyriq → Resend | Annual switch confirmed | You’re now on annual Kyriq billing |
| 20 | Cancellation scheduled | Kyriq → Resend | Cancel at period end | Your Kyriq cancellation is scheduled |
| 21 | Cancellation reversed | Kyriq → Resend | Scheduled cancellation removed | Your Kyriq subscription will continue |
| 22 | Subscription ended | Kyriq → Resend | Subscription actually terminates | Your Kyriq subscription has ended |
| 23 | Refund issued | STRIPE | Refund completed | Stripe refund/receipt communication |
| 24 | Payment method expiring | STRIPE | Stripe identifies expiring card | Stripe expiring-card notice |
| Hi {{first_name}},
Welcome to Kyriq.
Your 14-day trial is now active, with up to 250 check uploads included.
Connect your QuickBooks Online company, upload your checks, and let Kyriq do the comparison work.
Kyriq extracts the check details, compares every processed check against QuickBooks Online, and clearly shows you what it found. Exact matches can be approved together, while duplicates, mismatches, and lower-confidence results stay visible for individual review.
Once you approve a matched check, Kyriq can clear it directly in the QuickBooks reconciliation.
No more working through every check one at a time.
Your trial ends on {{trial_end_date}}.
Need help getting started? Reply to this email or contact support@kyriq.com.
The Kyriq Team |
| --- |
| Hi {{first_name}},
You’ve now uploaded {{checks_used}} of the 250 checks included with your Kyriq trial.
That means you’re halfway through the trial allowance — and it’s a good time to keep putting Kyriq through real reconciliation work.
Try a mix of exact matches, lower-confidence checks, duplicates, and mismatches so you can see how Kyriq handles the work you normally have to review manually.
You still have {{checks_remaining}} trial check uploads remaining and your trial runs through {{trial_end_date}}.
The Kyriq Team |
| --- |
| Hi {{first_name}},
You’ve uploaded {{checks_used}} of the 250 checks included with your Kyriq trial.
You still have {{checks_remaining}} trial uploads available, so nothing needs your attention yet. We just don’t want the limit to catch you by surprise while you’re in the middle of testing a reconciliation.
You can review your current usage and plan options anytime from your Kyriq account.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Your Kyriq trial has 3 days remaining.
If Kyriq is saving your team time, you can choose a plan now and keep your workflow moving without having to reconnect your QuickBooks Online companies or start over.
Your trial currently shows {{checks_used}} of 250 check uploads used.
Choose monthly billing for flexibility or annual billing to receive one month free compared with paying monthly for the same plan over 12 months.
Your trial ends on {{trial_end_date}}.
The Kyriq Team |
| --- |
| Hi {{first_name}},
You’ve used all 250 check uploads included with your Kyriq trial.
Your companies, reconciliation history, and account setup are still there. To continue uploading and processing checks, choose the Kyriq plan that fits your volume.
Once your paid plan is active, you can pick up where you left off — no need to rebuild your account or reconnect everything.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Your 14-day Kyriq trial has ended.
We’ve kept your account setup in place so continuing is simple. Choose a plan and you can get back to processing checks and reconciling in QuickBooks Online without starting from scratch.
If you’re still deciding which plan fits your firm, contact us at support@kyriq.com. We’ll help you choose based on the number of checks you actually expect to process.
The Kyriq Team |
| --- |
| Hi {{first_name}},
You’re all set. Your {{plan_name}} plan is now active.
Billing: {{billing_frequency}}
Included checks: {{checks_included}} per billing period
Additional checks: {{overage_rate}} per check after the included allowance
Next billing date: {{next_billing_date}}
Kyriq will keep processing your uploads if you go beyond the included allowance, so your reconciliation workflow doesn’t suddenly stop in the middle of the month.
You can view plan details, usage, and billing information anytime from your account.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Here’s a quick usage update for your {{plan_name}} plan.
You’ve uploaded {{checks_used}} of the {{checks_included}} checks included in your current billing period. You have {{checks_remaining}} included uploads remaining.
There’s nothing you need to do. We’re sending this early so you can keep an eye on volume without having to watch the counter yourself.
If you exceed the included allowance, Kyriq will continue processing checks at your plan’s overage rate of {{overage_rate}} per additional check.
The Kyriq Team |
| --- |
| Hi {{first_name}},
A quick heads-up: you’ve processed {{checks_used}} of the {{checks_included}} checks included with your {{plan_name}} plan this billing period.
Nothing needs to stop.
If you exceed your included check allowance, Kyriq will continue processing your uploads and any additional checks will simply be billed at your plan’s overage rate of {{overage_rate}} per check.
You can see your current usage anytime from your Kyriq account.
We designed Kyriq this way so your reconciliation workflow doesn’t suddenly stop because you reached a monthly limit.
The Kyriq Team |
| --- |
| Hi {{first_name}},
You’ve now used the {{checks_included}} checks included with your {{plan_name}} plan for this billing period.
Kyriq will keep working normally. You can continue uploading checks without interrupting your reconciliation workflow.
From this point through {{billing_period_end}}, additional uploaded checks will be billed at {{overage_rate}} per check.
Remember: usage is counted when a check is uploaded, including a check uploaded again.
You can monitor current usage anytime from your account.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Your account has moved into overage usage for the current billing period.
You’ve uploaded {{checks_used}} checks against {{checks_included}} included with your {{plan_name}} plan. Additional checks are now being billed at {{overage_rate}} per check through {{billing_period_end}}.
There’s no interruption to your workflow — Kyriq will continue processing your uploads normally.
If this volume is becoming typical for your firm, you can also review whether a higher plan would be a better fit.
The Kyriq Team |
| --- |
| Hi {{first_name}},
We still haven’t been able to complete payment for your Kyriq account.
Your outstanding balance is {{amount_due}} for your {{plan_name}} plan.
Please update your payment method so your account can remain active and your reconciliation workflow isn’t interrupted.
If you’ve already updated your billing information or completed payment, no further action is needed.
Need help? Contact support@kyriq.com and we’ll help you get it sorted out.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Your Kyriq account currently has a billing restriction because the outstanding payment of {{amount_due}} could not be completed.
Your account information has not been deleted. Once the balance is resolved, normal access can be restored.
Update your payment method or complete the outstanding payment from the billing portal.
If something doesn’t look right, contact support@kyriq.com before making changes and we’ll help.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Your payment has been completed and your Kyriq billing is current.
Your {{plan_name}} plan is active and any billing-related account restriction has been removed.
You can get right back to your reconciliation workflow.
Thanks for taking care of it.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Your Kyriq plan has been upgraded to {{new_plan_name}}.
Your new plan includes {{new_checks_included}} checks per billing period, with additional checks billed at {{new_overage_rate}} per check after the included allowance.
Effective date: {{effective_date}}
Billing frequency: {{billing_frequency}}
Next billing date: {{next_billing_date}}
Your existing companies, history, and QuickBooks Online connections stay exactly where they are.
The Kyriq Team |
| --- |
| Hi {{first_name}},
We’ve scheduled your Kyriq plan to change from {{current_plan_name}} to {{new_plan_name}} on {{effective_date}}.
Until then, your current plan and allowance remain in place.
Beginning {{effective_date}}, your new plan will include {{new_checks_included}} checks per billing period, with additional checks billed at {{new_overage_rate}} per check.
No account setup or QuickBooks Online connections will be affected by the change.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Your {{plan_name}} plan is now set to annual billing.
By choosing annual billing, you receive one month free compared with paying monthly for the same plan over 12 months.
Annual amount: {{annual_amount}}
Annual term begins: {{effective_date}}
Next renewal date: {{renewal_date}}
Your plan features, included check allowance, companies, and reconciliation workflow remain the same — only the billing schedule has changed.
The Kyriq Team |
| --- |
| Hi {{first_name}},
We’ve scheduled your Kyriq subscription to end on {{subscription_end_date}}.
You’ll continue to have access to your {{plan_name}} plan through that date. After the subscription ends, paid processing access will stop according to your account terms.
Changed your mind? You can cancel the scheduled termination before {{subscription_end_date}} and keep your account active without rebuilding your setup.
If you’re leaving because something didn’t work the way you expected, we’d genuinely like to know. Contact support@kyriq.com.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Your scheduled cancellation has been removed.
Your {{plan_name}} subscription will continue normally, and there’s nothing else you need to do.
Your next billing date is {{next_billing_date}}.
We’re glad to keep helping you spend less time working through checks one by one.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Your Kyriq subscription ended on {{subscription_end_date}}.
Your paid processing access is no longer active. If you decide to return, sign in to your Kyriq account to review the options available to reactivate service.
If you need help with your account or billing history, contact support@kyriq.com.
Thank you for using Kyriq.
The Kyriq Team |
| --- |
| Variable | Meaning |
| --- | --- |
| {{first_name}} | Customer/user first name |
| {{plan_name}} | Current paid plan name |
| {{current_plan_name}} / {{new_plan_name}} | Plan before/after a change |
| {{checks_used}} | Checks uploaded in the applicable trial/billing period |
| {{checks_included}} | Included checks for the paid plan |
| {{checks_remaining}} | Included checks remaining |
| {{overage_rate}} | Per-check overage rate for the customer’s plan |
| {{trial_end_date}} | Trial expiration date |
| {{billing_period_end}} | End of current usage/billing period |
| {{next_billing_date}} | Next charge/invoice date |
| {{amount_due}} | Outstanding amount |
| {{annual_amount}} | Annual subscription amount |
| {{effective_date}} | Date a plan/billing change takes effect |
| {{renewal_date}} | Annual renewal date |
| {{subscription_end_date}} | Date cancellation becomes effective |
| {{app_link}} | Authenticated Kyriq application URL |
| {{usage_link}} | Kyriq usage page |
| {{billing_link}} | Kyriq billing/plan page |
| {{billing_portal_link}} | Stripe Customer Portal session/link generated for the customer |
| {{reactivate_link}} | Kyriq cancellation/reactivation flow |
| {{account_link}} | Kyriq account sign-in/account page |