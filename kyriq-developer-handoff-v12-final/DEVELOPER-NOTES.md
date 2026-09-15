# Kyriq interactive prototype

Open `index.html` to start at the login screen. The demo is intentionally static HTML, CSS, and JavaScript so product behavior and navigation can be reviewed without a backend.

## Primary workflow

1. `upload.html` — upload check images or a PDF.
2. `match.html` — Kyriq processes and matches checks to QuickBooks.
3. `reconcile.html` — review only lower-confidence matches and discrepancies.
4. `matched.html` — inspect every 100% match individually or approve all exact matches.
5. `approve.html` — confirm the batch and clear approved checks in QuickBooks.

`all-checks.html` provides the complete batch view. The remaining sidebar routes demonstrate history, reports, companies, QuickBooks connections, team members, settings, billing, firm administration, and Kyriq super administration.

## Roles

- User: upload, review, approve, history, and reports as granted.
- Firm Admin: manage the firm's companies, team, permissions, QuickBooks connections, and billing.
- Super Admin: platform-wide firms, subscriptions, support, usage, and controls.

## Integration notes

- Replace `data-demo-action` handlers with application routes, dialogs, or API calls.
- Enforce role and company permissions on the server; hiding a menu item is not authorization.
- Use OAuth 2.0 for QuickBooks Online and persist realm/company mappings per firm.
- Use Stripe Checkout for initial purchase, webhooks as the subscription source of truth, Billing Portal for payment methods/invoices/cancellation, and Stripe meters or an internal usage ledger for check-volume overages.
- Keep exact matches visible and auditable even when bulk approval is enabled.
- All names, firms, vendors, account numbers, and financial details in this prototype are fictional.
