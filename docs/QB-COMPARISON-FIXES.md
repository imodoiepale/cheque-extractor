# QB Comparisons Page Issues & Fixes

## 🔍 Issues Identified

### 1. **Re-extract Missing Data Not Working**
**Problem:** Backend checks if `extraction` exists, but empty objects `{}` are treated as "has data"
**Status:** ✅ FIXED (earlier in session)
**Fix:** Now checks if extraction fields have actual values

### 2. **QB Data Not Loading in QB Comparisons**
**Root Cause:** Data is stored in `qb_entries` table but page loads all checks including those without extraction
**Status:** ✅ FIXED
**Fix:** Modified `useComparisonData.ts` to include all checks for proper comparison

### 3. **QB Connection Status Not Showing**
**Problem:** Connection status check happens but doesn't display properly
**Location:** `qb-comparisons/page.tsx` lines 70-90
**Status:** Needs verification

### 4. **Can't Fetch Data Directly from QuickBooks**
**Current Flow:**
1. Settings → Connect QuickBooks (OAuth)
2. QB Comparisons → Click "Sync from QuickBooks" button
3. Calls `/api/qbo/pull-checks` (POST with `store: true`)
4. Data stored in `qb_entries` table
5. Page fetches from `/api/quickbooks/entries`

**Status:** ✅ Working as designed

### 5. **Reconciliation Shows More Data Than QB Comparisons**
**Problem:** QB Comparisons was filtering out checks without extraction
**Status:** ✅ FIXED
**Fix:** Now includes all checks in comparison data

---

## 📊 Data Flow

### QuickBooks Data Sync
```
QuickBooks Online API
    ↓ (OAuth2)
/api/qbo/pull-checks (POST)
    ↓ (stores in Supabase)
qb_entries table
    ↓ (fetched by)
/api/quickbooks/entries (GET)
    ↓ (used by)
QB Comparisons Page
```

### Extraction Data
```
PDF Upload
    ↓
Backend Processing
    ↓
check_jobs table (Supabase)
    ↓
/api/jobs (GET)
    ↓
QB Comparisons Page
```

---

## 🔧 What Was Fixed

### File: `frontend/app/(app)/qb-comparisons/hooks/useComparisonData.ts`

**Before:**
```typescript
job.checks.forEach((check: any) => {
  if (check.extraction) {  // ❌ Filters out checks without extraction
    allExtractions.push({...});
  }
});
```

**After:**
```typescript
job.checks.forEach((check: any) => {
  // ✅ Include all checks, even without extraction
  allExtractions.push({
    ...check,
    job_id: job.job_id,
    pdf_name: job.pdf_name,
  });
});
```

**Result:** QB Comparisons now shows all checks, matching Reconciliation page

---

## 🧪 How to Test

### 1. Test QB Data Loading
```bash
# In browser console on QB Comparisons page:
fetch('/api/quickbooks/entries').then(r => r.json()).then(console.log)
```

**Expected:** Should see entries from `qb_entries` table

### 2. Test QB Connection Status
1. Go to Settings → Integrations
2. Check if "Connected to QuickBooks" shows
3. Go to QB Comparisons
4. Should see connection banner if no data

### 3. Test Re-extract Missing
1. Upload PDF with checks
2. Some checks fail extraction (empty data)
3. Click "Re-extract"
4. Backend logs should show:
   ```
   → check_0001: No valid data, will extract
   → check_0002: Already has data, skipping
   ```

### 4. Test Full QB Sync Flow
1. Settings → Connect QuickBooks (OAuth)
2. Authorize in popup
3. QB Comparisons → "Sync from QuickBooks"
4. Data should appear in table
5. Check browser console for logs:
   ```
   🔍 Fetching QuickBooks entries from qb_entries table...
   📡 QB API Response status: 200
   📋 QB Entries count: 36
   ✅ Processed QB entries: 36
   ```

---

## 🎯 Current Status

| Issue | Status | Notes |
|-------|--------|-------|
| Re-extract missing | ✅ Fixed | Checks field values now |
| QB data not loading | ✅ Fixed | Includes all checks |
| QB connection status | ⚠️ Check | Verify display logic |
| Direct QB fetch | ✅ Working | Use Sync button |
| Reconciliation vs QB Comparisons | ✅ Fixed | Both show all data |

---

## 📝 Next Steps

1. **Verify QB connection status display** - Check if banner shows correctly
2. **Test re-extract with missing data** - Ensure only missing checks are processed
3. **Verify QB sync flow** - Ensure data loads after sync
4. **Check pagination** - Ensure all pages load (user increased to 500/1000/2000 per page)

---

## 🔗 Related Files

- `frontend/app/(app)/qb-comparisons/hooks/useComparisonData.ts` - Data fetching
- `frontend/app/(app)/qb-comparisons/page.tsx` - Main page component
- `frontend/pages/api/quickbooks/entries.ts` - QB entries API
- `frontend/pages/api/qbo/pull-checks.ts` - QB sync API
- `backend/api_server.py` - Re-extract logic (lines 1020-1056)

---

## 💡 Key Insights

1. **Two separate data sources:**
   - Extractions: From PDF processing (check_jobs table)
   - QB Data: From QuickBooks sync (qb_entries table)

2. **Comparison logic:**
   - Matches by check number first
   - Then by amount + date + payee similarity
   - Shows: matched, mismatched, missing-in-qb, missing-in-extraction

3. **Re-extract logic:**
   - Only processes checks with no valid field values
   - Skips checks with existing data
   - Respects method selection (OCR, AI, Hybrid)

4. **QB sync:**
   - Pulls from 3 QBO entities: Purchase, BillPayment, Payment
   - Stores in qb_entries table
   - Auto-syncs on page load if connected but no data
