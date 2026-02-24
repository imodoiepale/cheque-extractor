# QuickBooks Data Status & Source Column

## ✅ Source Column Already Exists!

The QB Comparisons table **already has a Source column** that shows where data came from:

### Location
`frontend/app/(app)/qb-comparisons/components/ComparisonTable.tsx` (lines 291-305)

### How It Works
```typescript
<td className="px-1 py-0.5 text-center border-r-2 border-gray-300">
  {row.qbData ? (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
      row.qbData.qbSource === 'qbo_file_upload' 
        ? 'bg-blue-100 text-blue-700'      // File Upload = Blue badge
        : row.qbData.qbSource?.includes('cheque') 
          ? 'bg-green-100 text-green-700'  // QB API = Green badge
          : 'bg-purple-100 text-purple-700'
    }`}>
      {row.qbData.qbSource === 'qbo_file_upload' ? 'File' : 
       row.qbData.qbSource?.includes('cheque') ? 'QB API' : 
       row.qbData.qbSource || 'Unknown'}
    </span>
  ) : '—'}
</td>
```

### Source Types

| `qb_source` Value | Display Badge | Color | Meaning |
|-------------------|---------------|-------|---------|
| `qbo_file_upload` | **File** | Blue | Uploaded .qbo/.ofx file |
| `cheque_written` | **QB API** | Green | QB Online: Purchase (Check) |
| `bill_paid_by_cheque` | **QB API** | Green | QB Online: BillPayment (Check) |
| `cheque_received` | **QB API** | Green | QB Online: Payment (Check) |
| `FileImport` | **File** | Blue | Legacy file upload |
| Other | Source name | Purple | Other sources |

---

## 🔍 How to Check If QB Online API Data Exists

### Method 1: Check in Browser Console
```javascript
// On QB Comparisons page, open browser console (F12) and run:
fetch('/api/quickbooks/entries')
  .then(r => r.json())
  .then(data => {
    console.log('Total entries:', data.count);
    console.log('Entries:', data.entries);
    
    // Count by source
    const sources = {};
    data.entries.forEach(e => {
      sources[e.qb_source] = (sources[e.qb_source] || 0) + 1;
    });
    console.log('By source:', sources);
  });
```

### Method 2: Look at the Source Column
In the QB Comparisons table:
- **Green "QB API" badges** = Data from QuickBooks Online API
- **Blue "File" badges** = Data from uploaded files
- **No badge (—)** = No QB data for that check

---

## 🔧 Why QB Online API Data Might Not Be Showing

### Possible Reasons:

1. **QuickBooks Not Connected**
   - Go to Settings → Integrations
   - Check if "Connected to QuickBooks" shows
   - If not, click "Connect to QuickBooks" and authorize

2. **Never Synced Data**
   - Connection exists but no data pulled yet
   - Go to QB Comparisons page
   - Click "Sync from QuickBooks" button
   - Wait for sync to complete

3. **Access Token Expired**
   - QB tokens expire after 1 hour
   - Refresh tokens expire after 100 days
   - System auto-refreshes, but if refresh token expired, need to reconnect

4. **No Cheque Data in QuickBooks**
   - QB API only pulls:
     - Purchase transactions with PaymentType=Check
     - BillPayment transactions with PayType=Check
     - Payment transactions with cheque payment method
   - If your QB account has no cheques, nothing will sync

5. **Sandbox vs Production**
   - Check if using QB Sandbox or Production
   - Data in sandbox won't appear in production and vice versa

---

## 📊 How QB Online API Sync Works

### Flow:
```
1. User clicks "Sync from QuickBooks" button
   ↓
2. Frontend calls POST /api/qbo/pull-checks
   ↓
3. Backend checks QB connection & token expiry
   ↓
4. If expired, auto-refreshes access token
   ↓
5. Queries QuickBooks Online API:
   - Purchase (PaymentType=Check)
   - BillPayment (PayType=Check)
   - Payment (cheque method)
   ↓
6. Normalizes data and stores in qb_entries table
   ↓
7. Frontend fetches from /api/quickbooks/entries
   ↓
8. Data appears in QB Comparisons table with "QB API" badge
```

### API Endpoints Used:
- **QB OAuth:** `https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer`
- **QB Data:** `https://quickbooks.api.intuit.com/v3/company/{realmId}/query`
- **Queries:**
  ```sql
  SELECT * FROM Purchase WHERE PaymentType = 'Check' MAXRESULTS 1000
  SELECT * FROM BillPayment WHERE PayType = 'Check' MAXRESULTS 1000
  SELECT * FROM Payment MAXRESULTS 1000
  ```

---

## 🧪 Test QB Online API Connection

### Step 1: Verify Connection
1. Open Settings → Integrations
2. Look for QuickBooks section
3. Should show:
   - ✅ **Connected** (green badge) = OAuth successful
   - ⚠️ **Configured** (yellow) = Credentials saved but not connected
   - ❌ **Not Setup** (gray) = No credentials

### Step 2: Sync Data
1. Go to QB Comparisons page
2. Click **"Sync from QuickBooks"** button
3. Watch browser console for logs:
   ```
   📡 Calling QB pull-checks API...
   ✅ QB Sync result: {success: true, count: 45, ...}
   ```

### Step 3: Verify Data Loaded
1. Check QB Comparisons table
2. Look at **Source** column (rightmost in QB section)
3. Should see **green "QB API" badges** for synced data

### Step 4: Check Database
Run this in browser console:
```javascript
fetch('/api/quickbooks/entries')
  .then(r => r.json())
  .then(d => console.table(d.entries.map(e => ({
    check: e.check_number,
    payee: e.payee,
    amount: e.amount,
    source: e.qb_source
  }))));
```

---

## 🎯 Current Status Summary

**Source Column:** ✅ Already exists and working  
**QB API Integration:** ✅ Code implemented  
**Auto-sync:** ✅ Triggers on page load if connected but no data  
**Manual sync:** ✅ "Sync from QuickBooks" button available  

**What You Need To Do:**
1. Connect QuickBooks (if not already)
2. Click "Sync from QuickBooks" button
3. Data will appear with "QB API" badge in Source column

**If data still doesn't appear:**
- Check browser console for errors
- Verify QB account has cheque transactions
- Check if using correct QB environment (sandbox vs production)
- Verify access token hasn't expired (Settings → Integrations)
