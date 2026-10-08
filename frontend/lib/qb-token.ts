import { classifyRefreshFailure, markQbConnection, type QbConnectionStatus } from '@/lib/qb-health';

/**
 * The ONE QuickBooks token resolver.
 *
 * There were eleven separate `grant_type: 'refresh_token'` exchanges in
 * frontend/ and they had drifted apart in three ways that were wrong in
 * production, not latent:
 *
 *   1. Four of them (qbo/accounts, qbo/company-info, qbo/explore, qbo/preview)
 *      read ONLY the legacy `integrations` table. `qb_connections` is the
 *      multi-company source of truth, so those four talked to whichever
 *      company happened to be in the legacy row — the WRONG company for any
 *      firm with more than one connected.
 *   2. None of the eleven trimmed the client id or secret. A trailing newline
 *      in an env var or a pasted secret fails Intuit's Basic auth and reads as
 *      "bad credentials" rather than as whitespace. Only qbo/auth.ts and
 *      qbo/callback.ts trimmed, and only those two.
 *   3. Only some wrote the refreshed token back to BOTH stores. CLAUDE.md
 *      requires qb_connections and integrations to stay in sync, or the next
 *      caller that reads the other table uses a refresh token Intuit has
 *      already rotated away.
 *
 * Health is NOT re-decided here: lib/qb-health.ts owns that and this module
 * only calls it. Success clears the status as well as failure setting it,
 * because otherwise one transient Intuit 500 leaves a healthy firm flagged
 * forever and emails it about reconnecting.
 *
 * Returns a result rather than throwing, because the call sites genuinely
 * differ: getValidToken() throws, pull-checks returns null, qbo/diagnose.ts
 * reports the failure as a diagnostic step, and clear-transaction keeps using
 * the unexpired-but-stale token it already had.
 */

const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

/**
 * Refresh this long before the stated expiry. A token with under a minute left
 * is useless to the request that is about to use it, and three of the eleven
 * sites already used this window; the rest used zero and could hand a caller a
 * token that expired mid-flight.
 */
export const DEFAULT_EXPIRY_SKEW_MS = 60_000;

/** Trim every credential value. Rule, not special case — see note 2 above. */
function cred(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return value.trim() || null;
}

export interface QbConnectionRow {
  /** qb_connections.id, when the connection came from there. */
  connectionId: string | null;
  realmId: string;
  companyName: string | null;
  accessToken: string;
  refreshToken: string | null;
  /** ISO string, from token_expires_at or the legacy expires_at. */
  expiresAt: string | null;
  clientId: string | null;
  clientSecret: string | null;
  tenantId: string | null;
  /** Which table answered. 'integrations' means the legacy single-company row. */
  source: 'qb_connections' | 'integrations';
}

export type QbTokenFailureReason =
  | 'not_connected'
  | 'missing_credentials'
  | 'refresh_failed'
  | 'refresh_threw';

export interface QbTokenOk {
  ok: true;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  expiresIn: number | null;
  /** True when this call performed the Intuit exchange. */
  refreshed: boolean;
  connection: QbConnectionRow;
}

export interface QbTokenError {
  ok: false;
  reason: QbTokenFailureReason;
  detail: string;
  /** Intuit's HTTP status, when there was one. */
  status: number | null;
  /** What lib/qb-health.ts recorded for this failure. */
  health: QbConnectionStatus;
  /** Null only for 'not_connected'. */
  connection: QbConnectionRow | null;
}

export type QbTokenResult = QbTokenOk | QbTokenError;

export interface QbTokenOptions {
  /** Pin to one company. Omitted means "the active connection". */
  realmId?: string;
  /** Narrows every read and write. Required when using a service client. */
  tenantId?: string;
  /** Pin to one qb_connections row by id (the extension knows this). */
  connectionId?: string;
  /** Use this refresh token instead of the stored one (extension callers). */
  refreshToken?: string;
  /** Refresh even if the stored token looks valid. */
  force?: boolean;
  /** Refresh this long before expiry. Defaults to DEFAULT_EXPIRY_SKEW_MS. */
  skewMs?: number;
  /**
   * Client for the health write. lib/qb-health.ts defaults to a fresh service
   * client; pass one here to reuse a client you already hold. Must be able to
   * update qb_connections.status, so this is a SERVICE client, not an
   * RLS-scoped user client.
   */
  healthClient?: any;
}

/* ── reading the connection ──────────────────────────────────────────────── */

const CONN_COLUMNS =
  'id, tenant_id, realm_id, company_name, access_token, refresh_token, token_expires_at';
const LEGACY_COLUMNS =
  'access_token, refresh_token, realm_id, expires_at, qb_client_id, qb_client_secret';

async function readCredentials(
  supabase: any,
  tenantId?: string
): Promise<{ clientId: string | null; clientSecret: string | null }> {
  let q = supabase
    .from('integrations')
    .select('qb_client_id, qb_client_secret')
    .eq('provider', 'quickbooks');
  if (tenantId) q = q.eq('tenant_id', tenantId);

  const { data } = await q.maybeSingle();
  return {
    // Per-tenant credentials win over the env var, which is what the OAuth
    // start and callback already do.
    clientId: cred(data?.qb_client_id) ?? cred(process.env.QUICKBOOKS_CLIENT_ID),
    clientSecret: cred(data?.qb_client_secret) ?? cred(process.env.QUICKBOOKS_CLIENT_SECRET),
  };
}

/**
 * qb_connections first — it is the multi-company source of truth — then the
 * legacy `integrations` row. This fallback order is what the four
 * integrations-only routes were missing.
 */
export async function resolveQbConnection(
  supabase: any,
  opts: QbTokenOptions = {}
): Promise<QbConnectionRow | null> {
  try {
    let q = supabase.from('qb_connections').select(CONN_COLUMNS);
    if (opts.tenantId) q = q.eq('tenant_id', opts.tenantId);
    if (opts.connectionId) q = q.eq('id', opts.connectionId);
    else if (opts.realmId) q = q.eq('realm_id', opts.realmId);
    else q = q.eq('is_active', true);

    const { data: conn } = await q
      .order('connected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (conn?.realm_id && (conn.access_token || opts.refreshToken)) {
      const creds = await readCredentials(supabase, opts.tenantId ?? conn.tenant_id);
      return {
        connectionId: conn.id ?? null,
        realmId: conn.realm_id,
        companyName: conn.company_name ?? null,
        accessToken: conn.access_token ?? '',
        refreshToken: opts.refreshToken ?? conn.refresh_token ?? null,
        expiresAt: conn.token_expires_at ?? null,
        tenantId: conn.tenant_id ?? opts.tenantId ?? null,
        source: 'qb_connections',
        ...creds,
      };
    }
  } catch {
    // The table may not exist on an older database. Fall through.
  }

  // A caller that pinned a specific connection must NOT silently land on the
  // legacy single-company row — that is the wrong-company bug in reverse.
  if (opts.connectionId || opts.realmId) return null;

  let legacy = supabase.from('integrations').select(LEGACY_COLUMNS).eq('provider', 'quickbooks');
  if (opts.tenantId) legacy = legacy.eq('tenant_id', opts.tenantId);
  const { data } = await legacy.maybeSingle();

  if (!data?.access_token || !data?.realm_id) return null;
  return {
    connectionId: null,
    realmId: data.realm_id,
    companyName: null,
    accessToken: data.access_token,
    refreshToken: opts.refreshToken ?? data.refresh_token ?? null,
    expiresAt: data.expires_at ?? null,
    tenantId: opts.tenantId ?? null,
    source: 'integrations',
    clientId: cred(data.qb_client_id) ?? cred(process.env.QUICKBOOKS_CLIENT_ID),
    clientSecret: cred(data.qb_client_secret) ?? cred(process.env.QUICKBOOKS_CLIENT_SECRET),
  };
}

function isStale(conn: QbConnectionRow, skewMs: number): boolean {
  if (!conn.expiresAt) return true;
  const at = new Date(conn.expiresAt).getTime();
  if (Number.isNaN(at)) return true;
  return at <= Date.now() + skewMs;
}

/* ── writing the refreshed token to BOTH stores ──────────────────────────── */

async function persist(
  supabase: any,
  conn: QbConnectionRow,
  tokens: { access_token: string; refresh_token: string; expiresAt: string }
): Promise<void> {
  // qb_connections — the multi-company source of truth.
  let a = supabase.from('qb_connections').update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: tokens.expiresAt,
  });
  a = conn.connectionId ? a.eq('id', conn.connectionId) : a.eq('realm_id', conn.realmId);
  if (conn.tenantId) a = a.eq('tenant_id', conn.tenantId);

  // integrations — the legacy store. CLAUDE.md requires both to stay in sync,
  // or the next caller reading the other table replays a rotated refresh token.
  let b = supabase
    .from('integrations')
    .update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('provider', 'quickbooks');
  if (conn.tenantId) b = b.eq('tenant_id', conn.tenantId);

  const [resA, resB] = await Promise.all([a, b]);
  if (resA?.error) console.error('[qb-token] qb_connections token write failed:', resA.error.message);
  if (resB?.error) console.error('[qb-token] integrations token write failed:', resB.error.message);
}

/* ── the resolver ────────────────────────────────────────────────────────── */

export async function getQbToken(
  supabase: any,
  opts: QbTokenOptions = {}
): Promise<QbTokenResult> {
  const conn = await resolveQbConnection(supabase, opts);
  if (!conn) {
    return {
      ok: false,
      reason: 'not_connected',
      detail: 'QuickBooks not connected',
      status: null,
      health: 'unknown',
      connection: null,
    };
  }

  const skewMs = opts.skewMs ?? DEFAULT_EXPIRY_SKEW_MS;
  if (!opts.force && !isStale(conn, skewMs)) {
    return {
      ok: true,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      expiresAt: conn.expiresAt,
      expiresIn: null,
      refreshed: false,
      connection: conn,
    };
  }

  // Every outcome below calls markQbConnection INLINE rather than through a
  // local wrapper. scripts/check-email.ts asserts the full call shape on the
  // failure branch, and a wrapper would hide it from that assertion while a
  // mutant quietly dropped the classified status.
  if (!conn.clientId || !conn.clientSecret || !conn.refreshToken) {
    // 'unknown', NOT 'needs_reconnect': absent credentials are our own
    // misconfiguration and a firm must not be emailed about reconnecting
    // something only we can fix.
    const detail = 'Cannot refresh token — missing QuickBooks credentials';
    await markQbConnection({
      realmId: conn.realmId,
      tenantId: conn.tenantId,
      client: opts.healthClient,
      status: 'unknown',
      detail,
    });
    return { ok: false, reason: 'missing_credentials', detail, status: null, health: 'unknown', connection: conn };
  }

  let response: Response;
  try {
    response = await fetch(INTUIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${conn.clientId}:${conn.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: conn.refreshToken,
      }),
    });
  } catch (err: any) {
    const detail = `Token refresh threw: ${err?.message || 'unknown error'}`;
    console.error('[qb-token]', detail);
    await markQbConnection({
      realmId: conn.realmId,
      tenantId: conn.tenantId,
      client: opts.healthClient,
      status: 'error',
      detail,
    });
    return { ok: false, reason: 'refresh_threw', detail, status: null, health: 'error', connection: conn };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const detail = `Token refresh failed (${response.status})`;
    console.error('[qb-token]', detail, body.slice(0, 300));
    const health = classifyRefreshFailure(response.status, body);
    await markQbConnection({
      realmId: conn.realmId,
      tenantId: conn.tenantId,
      client: opts.healthClient,
      status: classifyRefreshFailure(response.status, body),
      detail,
    });
    return { ok: false, reason: 'refresh_failed', detail, status: response.status, health, connection: conn };
  }

  const tokens = await response.json();
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 0) * 1000).toISOString();
  await persist(supabase, conn, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiresAt,
  });

  // Success CLEARS the status. Without this one transient Intuit 500 leaves a
  // working firm marked needs_reconnect and emails it about that forever.
  await markQbConnection({
    realmId: conn.realmId,
    tenantId: conn.tenantId,
    client: opts.healthClient,
    status: 'connected',
    detail: null,
  });

  return {
    ok: true,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    expiresAt,
    expiresIn: Number(tokens.expires_in) || null,
    refreshed: true,
    connection: { ...conn, accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null, expiresAt },
  };
}

/**
 * Same resolver, for the call sites that want an exception.
 * Keeps getValidToken()'s contract in lib/match-helpers.ts unchanged.
 */
export async function getQbAccessToken(
  supabase: any,
  opts: QbTokenOptions = {}
): Promise<{ accessToken: string; connection: QbConnectionRow }> {
  const result = await getQbToken(supabase, opts);
  if (!result.ok) throw new Error(result.detail);
  return { accessToken: result.accessToken, connection: result.connection };
}
