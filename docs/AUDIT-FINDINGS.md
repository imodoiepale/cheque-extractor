# Kyriq System Audit — Critical Findings & Action Plan

**Date:** April 2025  
**Scope:** Web App (Next.js) + Chrome Extension (MV3)  
**Focus:** Production bugs, data integrity, stale code paths

---

## Executive Summary

| System | Status | Key Risk |
|--------|--------|----------|
| **QB Comparisons** (Web) | Functional | Data isolation issues |
| **Chrome Extension** | Functional | Same data isolation |
| **QB Match** (Web) | **Legacy/At Risk** | Uses stale QB queries |

**Critical Issue:** `qb_entries` table lacks `realm_id` (company) scoping, causing cross-company data contamination in multi-tenant setups.

---

## Critical Findings (Fix Immediately)

### 1. qb_entries Missing Company Scope

**Problem:** `qb_entries` only filters by `tenant_id`, not `realm_id`. When switching QB companies, data from Company A appears when viewing Company B.

**Impact:**
- Wrong matches shown after company switch
- Syncing Company A overwrites Company B's cached data
- Account dropdowns show mixed accounts

**Evidence:**
```
chrome-extension/background/service-worker.js:654
  upsert conflict = 'id' only (no realm)

frontend/pages/api/qbo/pull-checks.ts:582
  deletes ALL qb_entries for tenant before insert

frontend/pages/api/quickbooks/entries.ts:33
  reads qb_entries by tenant_id only
```

**Fix:**
1. Add `realm_id` column to `qb_entries`
2. Change upsert conflict to `tenant_id,realm_id,id`
3. Filter all reads by active `realm_id`
4. Delete only entries for active realm during sync

---

### 2. Stale QB Match Stack Still Active

**Problem:** `/app/(app)/qb-match/page.tsx` uses legacy `/api/matches/*` routes with outdated QB API calls.

**Impact:**
- Sync route queries non-existent `Check` entity → 400 error
- Uses `minorversion=65` (current is 73)
- Creates `Check` entities instead of `Purchase`/`Deposit`

**Evidence:**
```
frontend/pages/api/matches/sync-qb.ts:26
  SELECT * FROM Check  ← INVALID QUERY

frontend/pages/api/matches/create-in-qb.ts:48
  POST /check  ← WRONG ENTITY TYPE
```

**Fix:** Either:
- **Option A:** Deprecate QB Match page, redirect to QB Comparisons
- **Option B:** Migrate QB Match to use `qb_entries` + current sync architecture

---

### 3. Company Switch Doesn't Refresh Data

**Problem:** Switching companies in the UI updates `activeConnection` but doesn't trigger data refetch.

**Impact:** User sees previous company's data until manual refresh or page reload.

**Evidence:**
```
frontend/app/(app)/qb-comparisons/page.tsx
  useComparisonData doesn't watch active.realmId

frontend/hooks/useMatches.ts
  fetchMatches doesn't include realm dependency
```

**Fix:** Add `active?.realmId` to dependency arrays in:
- `useComparisonData.ts`
- `useMatches.ts`
- Reset caches on company switch

---

## High Severity (Fix This Week)

### 4. Hardcoded Account Names

**Problem:** `create-check.ts` assumes accounts exist by name:
- `Checking`
- `Undeposited Funds`
- `Uncategorized Expense`
- `Uncategorized Income`

**Impact:** Vouch → Create fails in companies with different account naming.

**Location:** `frontend/pages/api/qbo/create-check.ts:99-132`

**Fix:** Query QB for actual account IDs by type/subtype, or store per-tenant defaults.

---

### 5. Create-QB Doesn't Persist Locally

**Problem:** After creating a transaction in QB, it's not inserted into `qb_entries`/`qb_transactions`.

**Impact:** UI shows success but new transaction invisible until next full sync.

**Location:** `frontend/pages/api/qbo/create-check.ts:161-168`

**Fix:** Upsert created transaction into local tables immediately after QB success.

---

### 6. Token Refresh Logic Duplicated

**Problem:** 6+ different implementations of token lookup/refresh across codebase.

**Locations:**
- `chrome-extension/background/service-worker.js`
- `frontend/pages/api/qbo/pull-checks.ts`
- `frontend/lib/match-helpers.ts`
- `frontend/pages/api/qbo/preview.ts`
- `frontend/pages/api/qbo/explore.ts`

**Impact:** Some paths refresh in `qb_connections`, others in `integrations` — drift possible.

**Fix:** Centralize in single helper: `getValidToken(tenantId, realmId)`

---

### 7. Unsafe Integration Fallback

**Problem:** `qbo/callback.ts` uses service client and falls back to "any" integration row if tenant-specific not found.

**Location:** `frontend/pages/api/qbo/callback.ts:84-91`

**Impact:** Wrong credentials could be used during OAuth callback edge cases.

**Fix:** Remove fallback; enforce strict tenant match.

---

## Medium Severity (Fix When Convenient)

### 8. Sync Deletes All Tenant Data

**Problem:** `pull-checks.ts` deletes all `qb_entries` for tenant before inserting.

**Impact:** Partial sync failure = empty QB data until retry succeeds.

**Location:** `frontend/pages/api/qbo/pull-checks.ts:580-625`

---

### 9. Settings Shows Wrong Connection State

**Problem:** Settings page reads single `integrations` row, not active `qb_connections`.

**Impact:** Misleading connection status in multi-company setup.

**Location:** `frontend/pages/api/settings/integrations.ts:17-24`

---

### 10. Extension Account Fallback Unscoped

**Problem:** `GET_QB_ACCOUNTS` fallback reads `qb_entries` by tenant only.

**Impact:** Account list shows wrong company after switch.

**Location:** `chrome-extension/background/service-worker.js:1067-1071`

---

## Recommended Fix Order

### Phase 1: Data Integrity (This Week)
1. Add `realm_id` to `qb_entries` schema
2. Update all `qb_entries` queries to include `realm_id` filter
3. Fix upsert conflict key
4. Add realm-scoped delete in sync

### Phase 2: Architecture Cleanup (Next Week)
5. Deprecate or fix QB Match page
6. Remove `Check` entity query from sync-qb.ts
7. Centralize token refresh logic
8. Fix create-check.ts local persistence

### Phase 3: UX Polish (Following Week)
9. Auto-refresh on company switch
10. Fix hardcoded account names
11. Clean up settings/integrations API

---

## Quick Wins (Single File Changes)

| Fix | File | Lines | Change |
|-----|------|-------|--------|
| Add realm filter | `quickbooks/entries.ts` | 33 | Add `.eq('realm_id', activeRealmId)` |
| Fix sync conflict | `service-worker.js` | 654 | Change to `on_conflict=tenant_id,realm_id,id` |
| Remove Check query | `matches/sync-qb.ts` | 26 | Delete `Check` query line |
| Add realm to insert | `pull-checks.ts` | 590-625 | Include `realm_id` in insert rows |

---

## Appendix: File Inventory

### Active Production Paths
```
chrome-extension/background/service-worker.js  ← Extension sync, matching, approval
chrome-extension/sidepanel/sidepanel.js        ← Extension UI
frontend/pages/api/qbo/pull-checks.ts          ← Web sync (canonical)
frontend/pages/api/qbo/create-check.ts       ← Vouch/create in QB
frontend/pages/api/qbo/clear-transaction.ts  ← Approval clear
frontend/pages/api/quickbooks/entries.ts     ← Read QB data
frontend/app/(app)/qb-comparisons/page.tsx   ← Main UI
```

### Stale/Legacy Paths
```
frontend/pages/api/matches/sync-qb.ts        ← Uses Check entity (invalid)
frontend/pages/api/matches/create-in-qb.ts   ← Creates Check entity (wrong type)
frontend/app/(app)/qb-match/page.tsx         ← Uses stale API
frontend/hooks/useMatches.ts                 ← Wired to stale API
```

### Auth/Token Paths (Need Consolidation)
```
frontend/lib/match-helpers.ts              ← Should be canonical
frontend/pages/api/qbo/pull-checks.ts      ← Duplicate logic
frontend/pages/api/qbo/preview.ts          ← Reads only integrations
frontend/pages/api/qbo/explore.ts          ← Reads only integrations
```
