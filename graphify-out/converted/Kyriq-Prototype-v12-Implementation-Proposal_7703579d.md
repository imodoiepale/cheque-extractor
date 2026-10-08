<!-- converted from Kyriq-Prototype-v12-Implementation-Proposal.docx -->

KYRIQ
Prototype v12 Implementation Proposal
Scope, schedule and cost to bring the Kyriq app in line with the v12 developer handoff
Prepared for Michael  |  Prepared by James Epale  |  15 September 2026
# 1. Summary
I reviewed all 17 pages of the v12 prototype against the current Kyriq build. The prototype is a static click-through: it fixes the navigation and the order of the work, but every action button is a placeholder and no check image or side-by-side review screen exists in it yet.
The good news is that almost everything the prototype describes already works in the current app, and in most places the current app goes further. This is a restructure and a small number of new pages, not a rebuild.
The work splits cleanly into two phases:
- Phase 1, core workflow: the new layout, the 1-2-3-4 Reconcile flow, and consolidating the review screens. 2 days.
- Phase 2, firm and platform pages: Companies, Connections, Users and roles, History, Reports, Firm Admin and Stripe billing. 8 working days, capped at 10.
Total fixed cost for both phases is USD 1,800. Details are in section 5.
# 2. Answers to your questions
## The 1-2-3-4 steps on the Reconcile page
Keep them. They are the strongest idea in the prototype and the current app has nothing that walks a person through the job in order. Two changes make them work in production:
- Step state comes from the real batch, not from which page is open. Today the four steps are plain links, so a user can click Approve before anything has been uploaded. Approve will stay locked until Review has no unresolved rows or the user has excluded them.
- Step 2 (Match) becomes a progress screen that moves on by itself when matching finishes. The user only ever acts on Upload, Review and Approve.
## Letting someone jump straight in after subscribing or starting the trial
New users land directly on Step 1 of Reconcile. If QuickBooks is not connected yet, a Connect QuickBooks card appears above the upload box, right there in Step 1. Once connected the card disappears and they upload. Onboarding is therefore the same four steps they will use every day. No separate wizard, checklist or tour is needed.
## Matching preferences under Settings
Agreed, it adds nothing there. Those thresholds are fixed in code today and no one has needed to change them. The panel will be removed. One control stays: the auto-approve threshold, placed next to the Approve All button on the Review step where it is actually used. If a per-company override is ever wanted, it belongs on the Company page.
# 3. Scope of work
## Phase 1: core workflow (2 days)

## Phase 2: firm and platform pages (8 days, 10 max)
# 4. Schedule
The schedule starts the working day after your page-by-page notes arrive. Days are working days.

Turnaround is quick because I build with an AI coding agent (Hermes) that handles the repetitive parts of the work while I direct and review it. The days above already reflect that and include time for your feedback.
# 5. Cost

This is a fixed price for the scope above. Phase 1 is USD 600 and Phase 2 is USD 1,200. Each phase is invoiced on delivery. Items you remove after your page-by-page review come off the total at the rates shown. Anything not listed here is quoted separately before it starts.
Third-party accounts are yours and not included: Stripe, Intuit developer, Vercel, Railway and Supabase. Stripe transaction fees are billed by Stripe.
# 6. What stays from the current build
The prototype does not show these, but they exist today and will carry into the new layout unless you tell me to drop them in your notes:
- Extraction engine choice (Tesseract, NuMarkdown, Gemini, hybrid), page and cheque ranges, re-extract, per-field confidence.
- Remap to a different QuickBooks transaction, resolve a discrepancy, create a missing check in QuickBooks, edit date, reference and memo in QuickBooks, undo an approval, flag with a reason, internal notes.
- Fix All Discrepancies (bulk push of amount, date and check number to QuickBooks).
- Vouching a check without a QuickBooks match.
- .QBO, .OFX and .QFX bank file import for clients without a QuickBooks subscription.
- Export to CSV, IIF, QuickBooks Online CSV, Xero, Zoho Books and Sage.
- QuickBooks diagnostics and data explorer.
- The Chrome extension that clears transactions inside QuickBooks.
# 7. Items to correct in the prototype
- The USD 497 plan is named Growth on the Billing page and Firm on the website.
- Overage pricing is not stated anywhere. The site only says a re-uploaded check counts again.
- There are no profile, password, two-factor or notification settings. I will add a basic Profile panel under Settings unless you prefer otherwise.
- The Upload page marks Step 1 as current but captions Steps 1 and 2 as Completed.
- History filters and export, and the Reports page, have no working controls. Both are covered in Phase 2.
# 8. What I need from you to start
- Your page-by-page notes on what to remove or change.
- Confirmation of the three plan names and prices to use everywhere (site, sign-up, billing).
- Stripe account access, or a go-ahead for me to create one under your details.
- A QuickBooks sandbox company for end-to-end testing.

Thanks for sending the prototype through. Reply with your notes whenever they are ready and I will confirm the start date.
James Epale
| Item | What changes |
| --- | --- |
| New app shell and sidebar | Prototype navigation: Reconcile, History, Reports, Companies, Connections, Users, Settings, Billing, Admin section. |
| Reconcile flow with real stepper | One route with Upload, Match, Review, Approve. Step state driven by the batch. Forward steps locked until ready. |
| Review step consolidation | Merge QB Match and QB Comparisons into one Review screen with the prototype's three tabs: Needs Attention, 100% Matches, All Checks. One scoring engine. |
| Side-by-side review modal | Check image next to the QuickBooks record, with the existing row actions (approve, remap, resolve, flag, note, edit in QB, create in QB, undo). |
| Approve and Clear step | Batch summary, pre-flight checklist, server-side validation, bulk clear in QuickBooks, audit entries. |
| Settings cleanup | Remove matching preferences panel. Auto-approve threshold moves to the Review step. |
| Item | What changes |
| --- | --- |
| Companies and Connections pages | Company list with status and last sync. Connections page with the prototype's connect and reconnect flow. Diagnostics and .QBO file import kept as a sub-section. |
| Users, roles and invitations | User, Firm Admin and Super Admin roles in the database with row-level security. Invite by email, change role, remove. Menu items hidden and routes enforced server-side by role. |
| Stripe billing and trial | Checkout for the three plans, webhooks as the source of truth, customer portal for cards and invoices, usage metering per processed check, two-week trial capped at 200 checks. |
| History and Reports | Batch history with approver, status and export. Reports page with checks per period, auto-match rate, review rate and time saved, with date, company and account filters. |
| Firm Admin dashboard | Companies, completed this month, queues needing attention, active users, team activity, all from real batch data. |
| Marketing site alignment | Website copy and pricing brought in line with the app. Plan names and prices made consistent. |
| QA and cleanup | Responsive pass, removal of dead routes, end-to-end run of the full flow on a live QuickBooks sandbox. |
| Day | Work | You will see |
| --- | --- | --- |
| 1 | New shell, sidebar, Reconcile route and stepper, Upload and Match steps wired. | Log in, land on Step 1, upload, watch Match run and auto-advance. |
| 2 | Review consolidation, side-by-side modal, Approve and Clear step, settings cleanup. | Full four-step flow working end to end. Phase 1 delivered for your review. |
| 3 | Companies and Connections pages. | Connect and reconnect a company from the new Connections page. |
| 4 to 5 | Users, roles and invitations. | Invite a user, assign Firm Admin, confirm menu and access change by role. |
| 6 to 7 | Stripe billing and trial. | Start a trial, pick a plan, see usage count against the plan limit. |
| 8 | History and Reports, Firm Admin dashboard. | Past batches listed, reports with filters, firm overview. |
| 9 | Marketing site alignment, QA, responsive pass, cleanup. | Phase 2 delivered for your review. |
| 10 | Reserved for your review feedback and fixes. | Sign-off. |
| Item | Days | Cost (USD) |
| --- | --- | --- |
| Phase 1: core workflow (shell, stepper, review consolidation, side-by-side modal, Approve and Clear, settings cleanup) | 2 | $600 |
| Companies and Connections pages | 1 | $150 |
| Users, roles and invitations | 2 | $300 |
| Stripe billing and trial | 2 | $300 |
| History and Reports | 1.5 | $225 |
| Firm Admin dashboard | 0.5 | $75 |
| Marketing site alignment | 0.5 | $75 |
| QA, responsive pass and cleanup | 0.5 | $75 |
| Total, both phases | 10 | $1,800 |