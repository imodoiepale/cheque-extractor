# Kyriq — answers to your open questions, and what's needed on your side

Reference: handoff v17, the redesign site copy, your 21-item list in
*Update website with correct info.docx*, and the two email specification documents.
Everything below is settled unless it says otherwise.

---

## 1. Your open questions, answered

**How do I add free test accounts for a few firms?**
A Super Admin control. You grant a firm a free account with an expiry date and a reason, and the
grant is written to an audit log. It overrides the trial limits, so a pilot firm is never cut off
part-way through testing. This is how the trial firms get in.

**Subscribers must have QuickBooks — do we still need the file import section?**
Hide it from customers, keep it for Super Admin. Two reasons to keep it rather than delete it: it is
the diagnostic path when a firm's data looks wrong, and it is the fallback if a QuickBooks
connection breaks mid-reconciliation. Customers never see it.

**How do I stop people opening free trials with multiple email addresses?**
Three things together. One trial per QuickBooks company ID — the realm ID is the firm's real
identity and they cannot fake it, because connecting QuickBooks is the whole point of the product.
Plus email verification on, and a block on disposable-email domains. Email alone would not have
stopped it; the realm ID is what actually does.

**How many email addresses do I need?**
Two. `notifications@updates.kyriq.com` sends, and `support@kyriq.com` receives the replies. The
notifications address never needs to receive mail. The others you already created
(`hello@`, `billing@`, `privacy@`) are useful but not required by the app.

**Should uploads auto-delete after 7 or 14 days?**
14 days, counted from when the reconciliation is completed rather than from upload — otherwise a
firm that pauses mid-month loses files it still needs. The extracted data and the history stay.
Worth stating in the privacy policy, since it is a promise to their clients too.

**Will the extension have the same look and options as the app?**
Yes. The side panel is currently QuickBooks green while the app is navy; both move to the new brand
and the same glass styling, and the panel gets the same four steps — Upload, Match, Review, Approve
— plus History. It will also open QuickBooks to the company you are working on, so you watch each
approved item clear.

**MFA?**
Yes. Authenticator-app codes, required for Administrators.

**Am I charged per client or per team member?**
No. Companies and users are unlimited on every plan. You pay for checks processed only. That is a
real difference from the products that bill per client and per seat, and it is worth saying on the
pricing page.

**Google Workspace for the regular mailboxes, Resend for the app's email?**
Yes, that split is right. Workspace gives you the aliases; Resend sends the automated mail on
`updates.kyriq.com`. Resend Pro at 50,000 a month is more than enough to start.

**The two Chrome Web Store accounts.**
Nothing to delete. Google creates the personal one automatically and it cannot be removed, but it
does not appear on the listing. What shows publicly is three settings on the listing itself:
publisher name `Kyriq`, contact `support@kyriq.com`, and official URL `kyriq.com` once verified in
Google Search Console.

---

## 2. One wording conflict we need you to settle

The email documents say "check **uploads**". The website, the FAQ and the Stripe billing document
all say "**processed** checks", and the billing rules count a check only after processing succeeds.

The billing document is the one the system is built to, so the email copy needs the word changed, or
customers will read one number in an email and see a different one on their invoice. The email copy
is marked locked, so we are not changing it without you saying so.

Please confirm: change "uploads" to "processed" in the email copy.

---

## 3. What we need from you (not code — these block launch)

| What | Why it blocks | Status |
|---|---|---|
| Resend SPF, DKIM and DMARC on `updates.kyriq.com` | Mail is unreliable or spam-filed without them. Nothing should send before they are in place. | DNS records needed |
| Resend SMTP credentials into Supabase | Supabase's default sender is rate-limited to a handful an hour, so password resets fail the moment several people sign up at once. | Dashboard setting |
| Google Workspace domain verification TXT in Vercel DNS | Needed for the mailboxes. | DNS record |
| `kyriq.com` verified in Google Search Console | Required before the Chrome listing can show kyriq.com as the official URL. | Verification |
| Stripe products and prices, **Test and Live** | The three plans at both monthly and annual, with the overage rates. Test IDs and Live IDs are separate and go into separate environments. | Needs creating |
| Vercel Pro, project renamed to Kyriq, developer seats | Renaming changes the preview URLs; the backend allowlist has been updated for it. | In progress |
| Confirm the Intuit app is on your account with production keys | Also worth checking the API read volume against the free tier's 500,000 reads a month. It **blocks** rather than bills when exceeded, which would take every customer's sync down at once. | Needs confirming |

---

## 4. The logo

We have your note that versions 1 (the horizontal wordmark) and 7 (the square K icon) are the ones
to use, and the brand colours — Indigo `#6366f1` and Emerald `#10b981` — are already in the new
design tokens.

**We do not have the logo files themselves.** The source pack
(*Kyriq Logo — All Source files — 12 versions.zip*) did not reach the project folder; we have the
proposals, the specifications, the screenshots and the switcher mockup, but not the logo pack.
Please resend it and we will put versions 1 and 7 into the app, the extension icons and the favicon.

---

## 5. What's already done

- The QuickBooks connection flow had a real security hole: the link that connects a company carried
  the firm's identity unsigned, and a mismatch was only logged as a warning. A crafted link could
  have attached a QuickBooks company to the wrong firm. That is now signed and rejected properly.
- The extension's configuration endpoint was handing out keys to any website that asked. Closed.
- The Extraction Method choice is gone from upload and from the re-extract dialog — Kyriq picks the
  engine, as you asked. The processing page no longer shows Extraction Engines or Live Progress;
  the status card and the four steps tell people where they are.

## 6. In progress

The premium redesign of the whole app, the usage ledger behind the 250-check trial, roles and MFA,
the single Upload → Match → Review → Approve flow with the Continue Reconciliation card, Stripe
billing, the extension restyle, and the website copy.

One thing to flag honestly on timing: the full redesign lands before any pilot firm logs in, rather
than letting a firm see a half-restyled app. A firm evaluating the product forms its judgement in
the first two minutes. That moves the trial start later than Monday, and we would rather tell you
the new date than let it slip quietly. We will confirm it once the design foundation is verified.
