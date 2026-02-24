# QuickBooks & Cheque Data Setup Guide

## 🔀 Two Paths to Get Cheque Data Into the App

| | Path A: Upload .QBO File | Path B: Live API from QuickBooks Online |
|---|---|---|
| **What** | Upload a `.qbo` / `.ofx` / `.qfx` file from your bank | Connect to QBO via OAuth and pull cheques live |
| **Accounts needed** | None — just your bank's online banking | 1. **QuickBooks Online** subscription ([quickbooks.intuit.com](https://quickbooks.intuit.com)) |
| | | 2. **Intuit Developer** account ([developer.intuit.com](https://developer.intuit.com)) — free |
| **Cost** | Free | QBO: ~$30-200/mo; Developer account: free |
| **How** | Settings → Integrations → "Import from File" | Settings → Integrations → "Connect to QuickBooks" |
| | Or: Firm Dashboard → "Upload .QBO" button | Or: Firm Dashboard → "Sync from QuickBooks" button |
| **Data** | Bank transactions with check numbers, dates, amounts, payees | Purchase, BillPayment, Payment entities with full QBO metadata |

### Path A: Upload .QBO File (Recommended for quick start)
1. Log into your bank's online banking
2. Navigate to account statements / transaction download
3. Select date range and download as **QBO**, **OFX**, or **QFX** format
4. In the app: go to `/settings` → Integrations → "Import from File" section
5. Upload the file — cheque transactions are parsed and stored automatically

### Path B: Live API Pull (Full integration)
1. **Sign up for QuickBooks Online** at [quickbooks.intuit.com](https://quickbooks.intuit.com)
2. **Create an Intuit Developer account** at [developer.intuit.com](https://developer.intuit.com) (use same Intuit login)
3. **Create an app**: Dashboard → Create App → "QuickBooks Online and Payments"
4. **Get credentials**: Keys & Credentials tab → copy **Client ID** + **Client Secret**
5. **Set Redirect URIs** in the Intuit app (see table below)
6. **Enter credentials** in your app: `/settings` → Integrations → Configure Credentials
7. **Connect**: Click "Connect to QuickBooks" → authorize in Intuit popup → done
8. **Pull data**: Firm Dashboard → "Sync from QuickBooks"

---

## 📋 Intuit App Configuration (Path B only)

Here are the exact values you need to provide to Intuit when creating your app:

---

## 🔧 Development Environment

### Host Name
```
localhost:3080
```

### Launch URL
```
http://localhost:3080/settings
```

### Disconnect URL
```
http://localhost:3080/api/qbo/disconnect
```

### Redirect URI (OAuth callback)
```
http://localhost:3080/api/qbo/callback
```

---

## 🚀 Production Environment (Railway)

### Step 1: Get Your Railway URL
After deploying to Railway, you'll get a URL like:
```
https://your-app-name.up.railway.app
```

### Step 2: Configure Intuit App

| Field | Value |
|-------|-------|
| **Host Name** | `your-app-name.up.railway.app` |
| **Launch URL** | `https://your-app-name.up.railway.app/settings` |
| **Disconnect URL** | `https://your-app-name.up.railway.app/api/qbo/disconnect` |
| **Redirect URI** | `https://your-app-name.up.railway.app/api/qbo/callback` |

> **No custom domain yet?** Deploy a minimal OAuth shell to Railway/Cloud Run and use the generated HTTPS URL + callback path.

---

## 📝 Notes

1. **Multiple Environments**: You can add both development and production URLs in the Intuit app settings
2. **HTTPS Required**: Production must use HTTPS (Railway provides this automatically)
3. **Exact Match**: The redirect URI must match exactly what you configure in Intuit
4. **No Trailing Slash**: Don't add trailing slashes to the URLs

---

## 🔐 After Creating the App

You'll receive:
- **Client ID** (starts with `AB...`)
- **Client Secret**

You can store these in two ways:

### Option A: Environment Variables
```env
# .env.local
QUICKBOOKS_CLIENT_ID=your_client_id
QUICKBOOKS_CLIENT_SECRET=your_client_secret
QUICKBOOKS_REDIRECT_URI=http://localhost:3080/api/qbo/callback
```

### Option B: In-App Settings (Recommended)
1. Go to `/settings` → Integrations tab
2. Click "Configure QuickBooks Credentials"
3. Enter Client ID, Client Secret, and Redirect URI
4. Save — credentials are stored in Supabase `integrations` table

---

## 🔗 All App URLs Reference

| URL | Purpose |
|-----|---------|
| `/settings` | Main settings page with QB connect button |
| `/api/qbo/auth` | Initiates OAuth flow (GET) |
| `/api/qbo/callback` | OAuth callback handler (GET) |
| `/api/qbo/disconnect` | Disconnects QB (POST) |
| `/api/qbo/pull-checks` | Pulls cheque data from QBO (GET/POST) |
| `/api/quickbooks/entries` | Returns stored QB entries (GET) |
| `/api/settings/integrations` | Manage API keys & QB credentials (GET/PATCH) |
| `/firm-dashboard` | Firm-level reconciliation dashboard |
| `/reconciliation` | Side-by-side OCR vs QBO comparison |
| `/qb-comparisons` | Detailed comparison table |

---

## 📊 QuickBooks Cheque Data — What Gets Pulled

The `/api/qbo/pull-checks` endpoint pulls **three types** of cheque-related transactions:

### 1️⃣ Purchase (PaymentType=Check) — Writing a Cheque to Pay a Vendor

**When to use in QBO**: `+ New → Cheque`
- Paying rent, suppliers, utilities, or any direct payment by cheque

**QBO Query**: `SELECT * FROM Purchase WHERE PaymentType='Check'`

**Fields extracted**:
| Our Field | QBO Field | Description |
|-----------|-----------|-------------|
| check_number | DocNumber | Cheque number |
| date | TxnDate | Transaction date |
| amount | TotalAmt | Total amount |
| payee | EntityRef.name | Vendor/payee name |
| account | AccountRef.name | Bank account used |
| memo | PrivateNote | Notes/memo |

### 2️⃣ BillPayment (PayType=Check) — Paying an Existing Bill by Cheque

**When to use in QBO**: `+ New → Pay Bills` → Payment method: Cheque
- You already recorded a bill, now paying it by cheque

**QBO Query**: `SELECT * FROM BillPayment WHERE PayType='Check'`

**Fields extracted**:
| Our Field | QBO Field | Description |
|-----------|-----------|-------------|
| check_number | DocNumber | Cheque number |
| date | TxnDate | Transaction date |
| amount | TotalAmt | Bill payment amount |
| payee | VendorRef.name | Vendor name |
| account | CheckPayment.BankAccountRef.name | Bank account |
| memo | PrivateNote | Notes/memo |

### 3️⃣ Payment (PaymentMethodRef=Check) — Receiving a Cheque from a Customer

**When to use in QBO**: `+ New → Receive Payment` → Payment method: Cheque
- A customer pays you using a cheque
- Then: `+ New → Bank Deposit` to group and deposit it

**QBO Query**: `SELECT * FROM Payment` (filtered for cheque method)

**Fields extracted**:
| Our Field | QBO Field | Description |
|-----------|-----------|-------------|
| check_number | PaymentRefNum | Reference/cheque number |
| date | TxnDate | Payment date |
| amount | TotalAmt | Payment amount |
| payee | CustomerRef.name | Customer name |
| account | DepositToAccountRef.name | Deposit account |
| memo | PrivateNote | Notes/memo |

### 4️⃣ Direct Bank Cheque Withdrawal (No Vendor, No Bill)

**When to use in QBO**: `+ New → Cheque` → post directly to an expense account
- This is captured by type 1️⃣ above (Purchase with PaymentType=Check)

---

## ✅ Testing the Integration

1. Navigate to `/settings` → Integrations tab
2. Enter your QB Client ID and Secret (or set env vars)
3. Click **"Connect to QuickBooks"**
4. You'll be redirected to Intuit's OAuth page
5. Authorize the app
6. You'll be redirected back with success message
7. Go to `/firm-dashboard` and click **"Sync from QuickBooks"** to pull cheque data
8. Navigate to `/reconciliation` to compare OCR extractions with QBO data

---

## 🗄️ Database Setup

Run this SQL in Supabase (or use the migration file `004_add_qb_entries_table.sql`):

```sql
CREATE TABLE IF NOT EXISTS qb_entries (
  id TEXT PRIMARY KEY,
  qb_type TEXT NOT NULL,
  qb_source TEXT NOT NULL,
  check_number TEXT DEFAULT '',
  date TEXT DEFAULT '',
  amount TEXT DEFAULT '0',
  payee TEXT DEFAULT '',
  account TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🐛 Troubleshooting

### Error: "Redirect URI mismatch"
- Verify the URI in Intuit matches exactly
- Check for trailing slashes
- Ensure protocol (http/https) matches

### Error: "Invalid client credentials"
- Check your Client ID and Secret
- Verify they're in the correct environment variables
- Restart your server after changing .env

### Error: "QuickBooks not connected"
- Go to `/settings` → Integrations and connect first
- Ensure the `integrations` table exists in Supabase

### Error: "Token expired"
- The app auto-refreshes tokens, but if refresh fails, reconnect in Settings

### Error: "Connection failed"
- Check your internet connection
- Verify Intuit API is not down
- Check server logs for detailed error messages

---

## 📈 API Scopes Required

Your QuickBooks app needs this scope:
- `com.intuit.quickbooks.accounting` — Read/write accounting data (includes all cheque types)

## ⏱️ Rate Limits

- **Sandbox**: 100 requests/minute
- **Production**: 500 requests/minute per company
