# Kyriq — Chrome Extension

AI-powered check reconciliation for QuickBooks Online. Upload check images, extract data with Gemini AI, auto-match against QB transactions, and mark them as **Cleared** — all from your browser.

**$300/year** — Built by iTax Hub

---

## Features

- **Upload check images** directly from the extension popup (PNG, JPG, PDF)
- **AI OCR extraction** via Gemini — reads check #, date, amount, payee with 98.7% accuracy
- **Smart matching** against QuickBooks transactions (Amount 40pts, Check# 30pts, Date 15pts, Payee 15pts)
- **Approve & Clear** — one click to approve a match, stamp a Kyriq audit `PrivateNote` on the QB transaction, and queue it for auto-clearing on the QB Reconcile page (see **Approve flow** below)
- **Multi-company switcher** — switch between QB companies instantly
- **QBO overlay** — floating panel on QuickBooks Online pages showing match status
- **Bulk auto-approve** — auto-approve all matches with ≥95% confidence

## Setup

### 1. Load in Chrome

1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `chrome-extension/` folder

### 2. Generate Icons

Before publishing, open `icons/generate-icons.html` in a browser, right-click each canvas, and save as `icon16.png`, `icon48.png`, `icon128.png`.

### 3. Configure

Click the extension icon → ⚙️ Settings (or right-click → Options):

| Setting | Where to get it |
|---------|----------------|
| **Supabase URL** | Supabase Dashboard → Settings → API → URL |
| **Supabase Anon Key** | Supabase Dashboard → Settings → API → `anon` key |
| **QB Client ID** | Intuit Developer Portal → Your App → Keys |
| **QB Client Secret** | Intuit Developer Portal → Your App → Keys |
| **Gemini API Key** | Google AI Studio → API Keys |

### 4. Login

Use your Kyriq account credentials (same as the web app).

## How It Works

1. **Upload** check images via the Upload tab
2. **Gemini AI** extracts check number, date, amount, payee
3. **Sync** pulls the latest transactions from QuickBooks
4. **Match engine** scores each check against QB transactions
5. **Approve & Clear** — approves the match and updates the QB transaction with a verification note

## Approve flow (two-step, honest)

QuickBooks Online's IDS API makes the cleared / reconciliation flag **read-only** — no sparse update with `ClearedStatus`, `TxnStatus`, or `ClearStatus` will set it (QB returns Fault 2010 on every attempt). Kyriq works around this with a two-step flow:

**Step 1 — approve in Kyriq (API):**
- Stamp a `[Kyriq] Verified & Cleared …` block onto the QB transaction's `PrivateNote` via a sparse update.
- Read the current `ClearedStatus` from QB to classify the transaction:
  - `already_cleared` → QB already has it; nothing more to do.
  - `queued_for_reconcile` → add the transaction to the extension's local `kyriqApproved` store; the overlay will auto-tick it.
  - `manual_required` → BillPayment entries can only be ticked by hand on the Reconcile page.

**Step 2 — tick the "C" on the Reconcile page (content script):**
- The user clicks the toast CTA **Open QB Reconcile** (or the extension auto-opens it once per session).
- `content/qbo-overlay.js` injects an **Auto-Clear Kyriq Approved** button into `app.qbo.intuit.com/app/reconcile`.
- Clicking it iterates every row whose `intuit_id` / `check_number` / `amount` matches a Kyriq approval and clicks the row's Cleared checkbox — this is the only mechanism QBO exposes for setting the cleared flag programmatically.

Reference: [Satva Solutions — Identifying Reconciled Transactions in the QBO API](https://satvasolutions.com/blog/reconciled-transactions-quickbooks-online-api) confirms `ClearedStatus` is filter-only / read-only.

## File Structure

```
chrome-extension/
├── manifest.json          # MV3 manifest
├── background/
│   └── service-worker.js  # Auth, QB API, OCR, matching, clearing
├── popup/
│   ├── popup.html         # Main extension UI
│   ├── popup.css          # Styles (Kyriq branding)
│   └── popup.js           # UI controller
├── content/
│   ├── qbo-overlay.js     # Injected into QBO pages
│   └── qbo-overlay.css    # Overlay styles
├── options/
│   └── options.html       # Full settings page
└── icons/
    ├── icon16.png         # Toolbar icon
    ├── icon48.png         # Extensions page
    ├── icon128.png        # Chrome Web Store
    └── generate-icons.html # Icon generator
```

## Architecture

The extension is **standalone** — it talks directly to:
- **Supabase** for auth and data (same DB as the web app)
- **QuickBooks API** for pulling transactions and clearing them
- **Gemini API** for OCR check extraction

It shares the same database tables as the main Kyriq web app:
- `qb_connections` — multi-company QB connections
- `qb_transactions` — synced QB transactions
- `matches` — check-to-transaction matches
- `match_audit_log` — audit trail

## QB "Clear" Behavior

See **Approve flow** above for the full two-step explanation. Short version:

The extension writes a verification stamp onto the QB transaction's `PrivateNote`:

```
[Kyriq] Verified & Cleared: 2026-03-19
Check #: 1234
Payee: Acme Supplies
Amount: $742.00
...
```

That stamp is the audit trail. The "C" tick on the bank register comes from the overlay auto-clicking the Cleared checkbox on the QB Reconcile page — QB's API does not expose a write path for the cleared flag.
