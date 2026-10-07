import type { NextApiRequest, NextApiResponse } from 'next';
import { createAuthenticatedClient, createServiceClient } from '@/lib/supabase/api';
import { getQbToken } from '@/lib/qb-token';

const QBO_BASE = 'https://quickbooks.api.intuit.com';

/**
 * QuickBooks accounts for the ACTIVE company — bank accounts and credit cards.
 *
 *   GET  /api/qbo/accounts            cached read (syncs once if never synced)
 *   GET  /api/qbo/accounts?refresh=1  force a QBO pull
 *   POST /api/qbo/accounts            force a QBO pull
 *
 * Three things were wrong with the previous version, and all three are why it
 * could not back the account switcher:
 *
 *   1. It queried `WHERE AccountType = 'Bank'`, so CREDIT CARDS WERE INVISIBLE.
 *   2. It read only the legacy `integrations` row, so on a firm with several
 *      connected companies it answered for the WRONG company.
 *   3. It returned no last four, which the switcher rows show.
 *
 * It also hit QuickBooks on every call. The switcher is in the top bar on
 * every page, and Intuit's free read quota BLOCKS rather than bills at 500k a
 * month — a live query per render would take every customer's sync down at
 * once when it tripped. Reads now come from `qb_accounts` (migration 036) and
 * QuickBooks is only touched on an explicit refresh or the very first load.
 */

const SYNCED_TYPES = ['Bank', 'Credit Card'] as const;

export interface QbAccountRow {
  id: string;
  name: string;
  /** Kept for components/QuickBooksFilters.tsx, which reads fullName. */
  fullName: string;
  accountType: string;
  accountSubType: string | null;
  currentBalance: number | null;
  lastFour: string | null;
  active: boolean;
}

/** Last four of QBO's AcctNum. The rest is never stored (migration 036). */
export function lastFourOf(acctNum: unknown): string | null {
  const digits = String(acctNum ?? '').replace(/\D/g, '');
  return digits ? digits.slice(-4) : null;
}

function group(accounts: QbAccountRow[]) {
  return {
    bank: accounts.filter((a) => a.accountType === 'Bank'),
    creditCard: accounts.filter((a) => a.accountType === 'Credit Card'),
  };
}

async function readCache(
  supabase: any,
  tenantId: string,
  realmId: string
): Promise<{ accounts: QbAccountRow[]; syncedAt: string | null }> {
  const { data } = await supabase
    .from('qb_accounts')
    .select(
      'qb_account_id, name, fully_qualified_name, account_type, account_sub_type, last_four, current_balance, active, synced_at'
    )
    .eq('tenant_id', tenantId)
    .eq('realm_id', realmId)
    .order('account_type', { ascending: true })
    .order('name', { ascending: true });

  const accounts: QbAccountRow[] = (data || []).map((r: any) => ({
    id: r.qb_account_id,
    name: r.name,
    fullName: r.fully_qualified_name || r.name,
    accountType: r.account_type,
    accountSubType: r.account_sub_type,
    currentBalance: r.current_balance === null ? null : Number(r.current_balance),
    lastFour: r.last_four,
    active: r.active,
  }));

  return {
    accounts,
    syncedAt: (data || []).reduce(
      (latest: string | null, r: any) => (!latest || r.synced_at > latest ? r.synced_at : latest),
      null
    ),
  };
}

/** Pull the chart of accounts from QBO and replace the cache for this realm. */
async function syncFromQbo(
  supabase: any,
  tenantId: string,
  realmId: string,
  accessToken: string
): Promise<{ accounts: QbAccountRow[]; syncedAt: string } | { error: string; status: number }> {
  // Both groups in one read. `AccountType = 'Bank'` is the bug being fixed.
  const types = SYNCED_TYPES.map((t) => `'${t}'`).join(', ');
  const query = encodeURIComponent(`SELECT * FROM Account WHERE AccountType IN (${types})`);
  const url = `${QBO_BASE}/v3/company/${realmId}/query?query=${query}&minorversion=73`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { error: `Failed to fetch accounts from QuickBooks: ${detail.slice(0, 200)}`, status: response.status };
  }

  const data = await response.json();
  const syncedAt = new Date().toISOString();
  const rows = (data?.QueryResponse?.Account || [])
    .filter((acc: any) => SYNCED_TYPES.includes(acc.AccountType))
    .map((acc: any) => ({
      tenant_id: tenantId,
      realm_id: realmId,
      qb_account_id: String(acc.Id),
      name: acc.Name,
      fully_qualified_name: acc.FullyQualifiedName || acc.Name,
      account_type: acc.AccountType,
      account_sub_type: acc.AccountSubType ?? null,
      last_four: lastFourOf(acc.AcctNum),
      current_balance: acc.CurrentBalance ?? null,
      active: acc.Active !== false,
      synced_at: syncedAt,
    }));

  // Service role: `authenticated` has SELECT only on qb_accounts, so a user can
  // never write a balance into the cache.
  const service = createServiceClient();
  if (rows.length) {
    const { error } = await service
      .from('qb_accounts')
      .upsert(rows, { onConflict: 'tenant_id,realm_id,qb_account_id' });
    if (error) return { error: `Could not cache accounts: ${error.message}`, status: 500 };
  }

  // Drop accounts QuickBooks no longer returns (deleted or retyped), so the
  // switcher does not keep offering an account that is gone.
  const keep = rows.map((r: any) => r.qb_account_id);
  let stale = service.from('qb_accounts').delete().eq('tenant_id', tenantId).eq('realm_id', realmId);
  if (keep.length) stale = stale.not('qb_account_id', 'in', `(${keep.join(',')})`);
  await stale;

  return {
    syncedAt,
    accounts: rows
      .map((r: any) => ({
        id: r.qb_account_id,
        name: r.name,
        fullName: r.fully_qualified_name,
        accountType: r.account_type,
        accountSubType: r.account_sub_type,
        currentBalance: r.current_balance === null ? null : Number(r.current_balance),
        lastFour: r.last_four,
        active: r.active,
      }))
      .sort(
        (a: QbAccountRow, b: QbAccountRow) =>
          a.accountType.localeCompare(b.accountType) || a.name.localeCompare(b.name)
      ),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = createAuthenticatedClient(req);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();
    if (!profile?.tenant_id) return res.status(400).json({ error: 'No tenant found' });
    const tenantId = profile.tenant_id as string;

    // One resolver (lib/qb-token.ts): qb_connections first, so this answers for
    // the company the switcher says is active.
    const token = await getQbToken(supabase);
    if (!token.ok) {
      return res
        .status(token.reason === 'not_connected' ? 400 : 401)
        .json({ error: token.reason === 'not_connected' ? 'QuickBooks not connected' : token.detail });
    }
    const realmId = token.connection.realmId;

    const cached = await readCache(supabase, tenantId, realmId);
    const wantsRefresh = req.method === 'POST' || req.query.refresh === '1' || req.query.refresh === 'true';

    // A never-synced realm syncs once on first read, so the switcher is not
    // empty until someone finds the refresh button.
    if (!wantsRefresh && cached.accounts.length > 0) {
      return res.status(200).json({
        accounts: cached.accounts,
        groups: group(cached.accounts),
        count: cached.accounts.length,
        realmId,
        syncedAt: cached.syncedAt,
        cached: true,
      });
    }

    const synced = await syncFromQbo(supabase, tenantId, realmId, token.accessToken);
    if ('error' in synced) {
      // A failed refresh must not blank a switcher that had data a moment ago.
      if (cached.accounts.length > 0) {
        return res.status(200).json({
          accounts: cached.accounts,
          groups: group(cached.accounts),
          count: cached.accounts.length,
          realmId,
          syncedAt: cached.syncedAt,
          cached: true,
          warning: synced.error,
        });
      }
      return res.status(synced.status).json({ error: synced.error });
    }

    return res.status(200).json({
      accounts: synced.accounts,
      groups: group(synced.accounts),
      count: synced.accounts.length,
      realmId,
      syncedAt: synced.syncedAt,
      cached: false,
    });
  } catch (error: any) {
    console.error('QB accounts error:', error);
    return res.status(500).json({ error: error.message || 'Failed to fetch accounts' });
  }
}
