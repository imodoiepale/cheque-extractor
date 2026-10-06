<!-- converted from Kyriq_Operational_Account_Email_Specification.docx -->

KYRIQ
Operational + Account
Email Specification
Account • Security • Team • QuickBooks Online • Processing • Reconciliation

# 1. Developer Rules
LOCKED COPY — DO NOT REWRITE
The subject lines, body copy, CTA text, and customer-facing terminology below are approved Kyriq production copy. Do not paraphrase, shorten, replace, or substitute default provider templates without Kyriq approval.
Routine workflow status belongs in the Kyriq app. Email is reserved for invitations, security, connection issues, failures, completed work that is useful outside the app, and other events that reasonably require attention.
# 2. Delivery Rules
# 3. Notification Matrix

# 4. Approved Email Copy
## 01. Team invitation
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Invitation created
Subject: You’ve been invited to join {{firm_name}} on Kyriq
CTA: Accept invitation → {{invite_link}}

## 02. Invitation accepted
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Invitee accepts invitation
Subject: {{member_name}} has joined your Kyriq team
CTA: View team → {{team_link}}

## 03. Invitation expired
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Invite link expires
Subject: Your Kyriq invitation has expired
CTA: Request a new invitation → {{request_invite_link}}

## 04. Password reset
SEND VIA: AUTH PROVIDER    |    TRIGGER: Password-reset request
Subject: Reset your Kyriq password
CTA: Reset password → {{password_reset_link}}

## 05. Password changed
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Password successfully changed
Subject: Your Kyriq password was changed
CTA: Secure my account → {{security_link}}

## 06. Verify email address
SEND VIA: AUTH PROVIDER    |    TRIGGER: New account/email requires verification
Subject: Verify your email for Kyriq
CTA: Verify email → {{verification_link}}

## 07. Email address changed
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Account email changed
Subject: Your Kyriq email address was changed
CTA: Review account security → {{security_link}}

## 08. New login alert
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Risk-based new-device/login event
Subject: New sign-in to your Kyriq account
CTA: Review security → {{security_link}}

## 09. Team member removed
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Member removed from firm
Subject: Your access to {{firm_name}} on Kyriq has changed

## 10. Role changed
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Member role changes
Subject: Your Kyriq role has been updated
CTA: Open Kyriq → {{app_link}}

## 11. QBO connected
SEND VIA: KYRIQ → RESEND    |    TRIGGER: QBO company connection succeeds
Subject: QuickBooks Online is connected to Kyriq
CTA: Start reconciling → {{app_link}}

## 12. QBO connection needs attention
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Token/authorization failure
Subject: QuickBooks Online needs to be reconnected
CTA: Reconnect QuickBooks → {{qbo_reconnect_link}}

## 13. QBO disconnected
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Connection intentionally removed
Subject: QuickBooks Online was disconnected from Kyriq
CTA: Reconnect QuickBooks → {{qbo_reconnect_link}}

## 14. Processing failed
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Upload/job cannot complete
Subject: Kyriq couldn’t finish processing your upload
CTA: Review upload → {{upload_link}}

## 15. Reconciliation batch completed
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Meaningful batch/reconciliation job completes and email preference enabled
Subject: Your Kyriq reconciliation results are ready
CTA: Review results → {{reconciliation_link}}

## 16. Report ready
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Requested report finishes generating
Subject: Your Kyriq report is ready
CTA: View report → {{report_link}}

## 17. Company added
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Company added when admin notification enabled
Subject: {{company_name}} was added to Kyriq
CTA: View company → {{company_link}}

## 18. Support request received
SEND VIA: KYRIQ → RESEND    |    TRIGGER: Support form/ticket submitted
Subject: We received your Kyriq support request
CTA: View Kyriq → {{app_link}}

# 5. Implementation Notes
• Do not email customers for every routine OCR completion or individual match. Those events belong in the app.
• Reconciliation-complete email should be preference-controlled so firms can disable it if they process many batches.
• Security messages must never include passwords, full authentication tokens, or sensitive financial data.
• Approximate location in login alerts should only be included if the authentication/security system reliably supplies it; otherwise omit that line rather than guessing.
• Password-reset and verification links must be single-purpose, secure, and expire according to the authentication provider’s configuration.
• QBO reconnect links should send the user into Kyriq’s authenticated reconnect flow, not expose raw OAuth details.
• Do not send default provider templates in parallel with these approved messages.
| Delivery label | When to use | Customer-facing identity |
| --- | --- | --- |
| KYRIQ → RESEND | Branded operational, team, QBO, processing and reconciliation emails | Kyriq <notifications@updates.kyriq.com>; Reply-To support@kyriq.com |
| AUTH PROVIDER | Secure password-reset / verification action only when provider must own the tokenized flow | Customize provider template to the exact Kyriq copy below; do not use provider default wording |
| KYRIQ APP ONLY | Routine status that does not require an email | Use the same terminology as these emails |
| # | Message | Send via | Trigger | Email? |
| --- | --- | --- | --- | --- |
| 01 | Team invitation | KYRIQ → RESEND | Invitation created | Yes |
| 02 | Invitation accepted | KYRIQ → RESEND | Invitee accepts invitation | Yes |
| 03 | Invitation expired | KYRIQ → RESEND | Invite link expires | Yes |
| 04 | Password reset | AUTH PROVIDER | Password-reset request | Yes |
| 05 | Password changed | KYRIQ → RESEND | Password successfully changed | Yes |
| 06 | Verify email address | AUTH PROVIDER | New account/email requires verification | Yes |
| 07 | Email address changed | KYRIQ → RESEND | Account email changed | Yes |
| 08 | New login alert | KYRIQ → RESEND | Risk-based new-device/login event | Yes |
| 09 | Team member removed | KYRIQ → RESEND | Member removed from firm | Yes |
| 10 | Role changed | KYRIQ → RESEND | Member role changes | Yes |
| 11 | QBO connected | KYRIQ → RESEND | QBO company connection succeeds | Yes |
| 12 | QBO connection needs attention | KYRIQ → RESEND | Token/authorization failure | Yes |
| 13 | QBO disconnected | KYRIQ → RESEND | Connection intentionally removed | Yes |
| 14 | Processing failed | KYRIQ → RESEND | Upload/job cannot complete | Yes |
| 15 | Reconciliation batch completed | KYRIQ → RESEND | Meaningful batch/reconciliation job completes and email preference enabled | Yes |
| 16 | Report ready | KYRIQ → RESEND | Requested report finishes generating | Yes |
| 17 | Company added | KYRIQ → RESEND | Company added when admin notification enabled | Yes |
| 18 | Support request received | KYRIQ → RESEND | Support form/ticket submitted | Yes |
| A1 | Routine OCR/upload complete | KYRIQ APP ONLY | Normal processing success | No |
| A2 | Exact match found / individual result | KYRIQ APP ONLY | Per-check result | No |
| A3 | Check approved | KYRIQ APP ONLY | Individual approval | No |
| A4 | Company/account selection changed | KYRIQ APP ONLY | Routine configuration | No |
| A5 | History entry created | KYRIQ APP ONLY | Routine system logging | No |
| Hi {{first_name}},
{{inviter_name}} has invited you to join {{firm_name}} on Kyriq as {{role_name}}.
Kyriq helps your team process check images, compare them with QuickBooks Online, review results, and move approved matches through the reconciliation workflow without checking every item one by one.
Your invitation expires on {{invite_expiration_date}}.
Use the button below to create or access your account and join the team.
If you weren’t expecting this invitation, you can ignore this email.
The Kyriq Team |
| --- |
| Hi {{first_name}},
{{member_name}} has accepted your invitation and joined {{firm_name}} on Kyriq as {{role_name}}.
They can now access the companies and features permitted by that role.
You can review team members and permissions anytime from Team settings.
The Kyriq Team |
| --- |
| Hi {{first_name}},
The invitation to join {{firm_name}} on Kyriq has expired.
For security, expired invitation links can’t be reused. If you still need access, request a new invitation from {{firm_name}} or use the button below.
The Kyriq Team |
| --- |
| Hi {{first_name}},
We received a request to reset the password for your Kyriq account.
Use the secure link below to choose a new password. This link expires on {{reset_expiration}}.
If you didn’t request a password reset, don’t use the link. Your current password will remain unchanged.
For help, contact support@kyriq.com.
The Kyriq Team |
| --- |
| Hi {{first_name}},
The password for your Kyriq account was changed on {{change_date_time}}.
If you made this change, there’s nothing else you need to do.
If you didn’t change your password, secure your account immediately and contact support@kyriq.com.
The Kyriq Team |
| --- |
| Hi {{first_name}},
One quick step and your Kyriq email address will be verified.
Use the secure link below to confirm that {{email_address}} belongs to you.
If you didn’t create or update a Kyriq account using this address, you can ignore this message.
The Kyriq Team |
| --- |
| Hi {{first_name}},
The email address on your Kyriq account was changed from {{old_email}} to {{new_email}} on {{change_date_time}}.
If you made this change, no action is needed.
If you didn’t make this change, review your account security immediately and contact support@kyriq.com.
The Kyriq Team |
| --- |
| Hi {{first_name}},
We noticed a sign-in to your Kyriq account from a device or browser we haven’t seen before.
Time: {{login_date_time}}
Device: {{device}}
Approximate location: {{approximate_location}}
If this was you, no action is needed.
If you don’t recognize this activity, secure your account immediately and contact support@kyriq.com.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Your team access to {{firm_name}} on Kyriq was removed on {{change_date_time}}.
You will no longer be able to access that firm’s companies or reconciliation workspace through this membership.
If you believe this was done in error, contact your firm administrator.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Your role for {{firm_name}} on Kyriq has been changed from {{old_role}} to {{new_role}}.
Your available features and permissions now reflect the {{new_role}} role.
If you have questions about the change, contact your firm administrator.
The Kyriq Team |
| --- |
| Hi {{first_name}},
{{company_name}} is now connected to Kyriq through QuickBooks Online.
You can select the appropriate bank account, upload check images, compare every processed check with QuickBooks Online, approve exact matches together, and review lower-confidence results, duplicates, mismatches, or no-match items individually.
Approved matched checks can then be cleared through the QuickBooks reconciliation workflow.
You’re ready to get to work.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Kyriq can’t currently communicate with QuickBooks Online for {{company_name}}.
This can happen when an authorization expires, access changes in QuickBooks, or the connection needs to be refreshed.
Your Kyriq data hasn’t been deleted. Reconnect QuickBooks Online to restore the connection and continue your reconciliation workflow.
If reconnecting doesn’t solve it, contact support@kyriq.com.
The Kyriq Team |
| --- |
| Hi {{first_name}},
The QuickBooks Online connection for {{company_name}} was disconnected from Kyriq on {{change_date_time}}.
Kyriq will no longer be able to compare new uploads with that QuickBooks company or clear approved matches through its reconciliation workflow until the connection is restored.
If this was intentional, no action is needed.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Kyriq couldn’t finish processing the upload for {{company_name}}.
Upload: {{upload_name}}
Time: {{event_date_time}}
No need to guess what happened. Open the upload to review its status and try again if appropriate.
If the problem continues, contact support@kyriq.com and include the upload name above so we can help quickly.
The Kyriq Team |
| --- |
| Hi {{first_name}},
Kyriq has finished comparing the checks in {{upload_name}} for {{company_name}}.
Processed: {{processed_count}}
100% matches: {{exact_match_count}}
Needs individual review: {{review_count}}
Your results are ready. You can approve the exact matches together and focus individual review on the checks that actually need attention.
Open Kyriq to review the results and continue the reconciliation workflow.
The Kyriq Team |
| --- |
| Hi {{first_name}},
The report you requested for {{company_name}} is ready.
Report: {{report_name}}
Period: {{report_period}}
Open Kyriq to view or download it.
The Kyriq Team |
| --- |
| Hi {{first_name}},
{{company_name}} has been added to {{firm_name}} in Kyriq.
You can now connect its QuickBooks Online company, select the appropriate account, and begin processing check images.
The Kyriq Team |
| --- |
| Hi {{first_name}},
We received your Kyriq support request.
Reference: {{support_reference}}
Topic: {{support_topic}}
Our team will review the details you submitted. If we need anything else, we’ll reply to this email.
There’s no need to submit the same request again.
The Kyriq Team |
| --- |