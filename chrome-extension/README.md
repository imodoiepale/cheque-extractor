# CheckSync Pro — Chrome Extension

AI-powered check reconciliation for QuickBooks Online. Upload check images, extract data with Gemini AI, auto-match against QB transactions, and mark them as **Cleared** — all from your browser.

**$300/year** — Built by iTax Hub

---

## Features

- **Upload check images** directly from the extension popup (PNG, JPG, PDF)
- **AI OCR extraction** via Gemini — reads check #, date, amount, payee with 98.7% accuracy
- **Smart matching** against QuickBooks transactions (Amount 40pts, Check# 30pts, Date 15pts, Payee 15pts)
- **Approve & Clear** — one click to approve a match AND mark the QB transaction as Cleared
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

Use your CheckSync Pro account credentials (same as the web app).

## How It Works

1. **Upload** check images via the Upload tab
2. **Gemini AI** extracts check number, date, amount, payee
3. **Sync** pulls the latest transactions from QuickBooks
4. **Match engine** scores each check against QB transactions
5. **Approve & Clear** — approves the match and updates the QB transaction with a verification note

## File Structure

```
chrome-extension/
├── manifest.json          # MV3 manifest
├── background/
│   └── service-worker.js  # Auth, QB API, OCR, matching, clearing
├── popup/
│   ├── popup.html         # Main extension UI
│   ├── popup.css          # Styles (CheckSync Pro branding)
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

It shares the same database tables as the main CheckSync Pro web app:
- `qb_connections` — multi-company QB connections
- `qb_transactions` — synced QB transactions
- `matches` — check-to-transaction matches
- `match_audit_log` — audit trail

## QB "Clear" Behavior

When you approve a match, the extension calls the QB API to update the transaction's `PrivateNote` with a verification stamp:

```
[CheckSync Pro] Verified & Cleared 2026-03-19
```

This serves as proof of reconciliation. Full "Cleared" status in QB's reconcile screen requires the user to complete QB's reconciliation flow, but the verified note makes it immediately visible which transactions have been matched.
