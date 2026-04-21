/**
 * Kyriq — Background Service Worker
 * Handles: Supabase auth, QB API calls, token refresh, matching, clearing transactions
 */

const CONFIG_CACHE_TTL = 3600000; // 1 hour in ms

// In-memory checks cache — avoids round-tripping 1000+ check objects through sendMessage
let _swChecksCache = null;

/**
 * Safely extract a string from an OCR extraction field.
 * Fields can be a plain string, a number, or an object like { value: "...", confidence: 0.9 }.
 * Falls back to null — never returns [object Object].
 */
function safeStr(f) {
  if (f == null) return null;
  if (typeof f === 'string') return f.trim() || null;
  if (typeof f === 'number') return String(f);
  if (typeof f === 'object') {
    const v = f.value;
    return (v != null && String(v).trim()) ? String(v).trim() : null;
  }
  return null;
}

// ── Structured logging ───────────────────────────────────────
function log(msg, data) {
  const ts = new Date().toISOString().slice(11, 23);
  if (data !== undefined) {
    console.log(`[Kyriq SW ${ts}] ${msg}`, data);
  } else {
    console.log(`[Kyriq SW ${ts}] ${msg}`);
  }
}
function logErr(msg, err) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[Kyriq SW ${ts}] ❌ ${msg}`, err?.message || err);
}

// #region agent log
/** NDJSON debug ingest (session 76c285) — no secrets / no PII */
function debugAgentLog(payload) {
  const body = {
    sessionId: '76c285',
    runId: 'ext-audit',
    timestamp: Date.now(),
    ...payload,
  };
  // Mirror to SW console when NDJSON ingest is unavailable (copy from DevTools → Service worker)
  try {
    log('[AGENT_DEBUG]', body);
  } catch (_) {}
  fetch('http://127.0.0.1:7415/ingest/f682ae64-23f5-470b-ad66-bf3be254098b', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '76c285' },
    body: JSON.stringify(body),
  }).catch(() => {});
}
// #endregion

// ── Hardcoded Bootstrap Config (Update these for your deployment) ─
const BOOTSTRAP_CONFIG = {
  supabaseUrl: 'https://yqbmzerdagqevjdwhlwh.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYm16ZXJkYWdxZXZqZHdobHdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MjA2NjEsImV4cCI6MjA4NTE5NjY2MX0.0m_AeHUTQX1s-h5wbZfcdmS-uePpgd-9cI1m3CIeXi4',
  backendUrl: 'https://check-extractor-production-2026.up.railway.app/',
  frontendUrl: 'https://kyriq.com',
};

function getBootstrapConfig() {
  log('getBootstrapConfig', { url: BOOTSTRAP_CONFIG.supabaseUrl, hasKey: !!BOOTSTRAP_CONFIG.supabaseAnonKey, hasBackend: !!BOOTSTRAP_CONFIG.backendUrl, hasFrontend: !!BOOTSTRAP_CONFIG.frontendUrl });
  return BOOTSTRAP_CONFIG;
}

// ── App config (fetched from backend post-login, cached 1 hr) ─
// Contains: geminiApiKey, qbClientId (and mirrors supabase creds)
// NOTE: /api/extension/* routes live in Next.js (frontendUrl), NOT in the Python backend.
async function getConfig() {
  const bootstrap = getBootstrapConfig();

  const { configCache } = await chrome.storage.local.get('configCache');
  if (configCache && Date.now() < configCache.expiresAt) {
    return { ...configCache.data, ...bootstrap };
  }

  // Use frontendUrl (kyriq.com) — that's where Next.js API routes live
  const apiHost = (bootstrap.frontendUrl || bootstrap.backendUrl || '').replace(/\/$/, '');
  if (!apiHost) {
    return { ...bootstrap, geminiApiKey: '', qbClientId: '' };
  }

  const session = await getSession();
  const headers = { 'Content-Type': 'application/json' };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }

  try {
    log(`Fetching app config from ${apiHost}/api/extension/config`);
    const res = await fetch(`${apiHost}/api/extension/config`, { headers });
    if (!res.ok) throw new Error(`Config fetch failed: ${res.status}`);
    const remote = await res.json();
    const merged = { ...remote, ...bootstrap };
    await chrome.storage.local.set({
      configCache: { data: remote, expiresAt: Date.now() + CONFIG_CACHE_TTL },
    });
    log('App config fetched and cached', { hasGemini: !!remote.geminiApiKey, hasQbClientId: !!remote.qbClientId });
    // #region agent log
    debugAgentLog({
      hypothesisId: 'E',
      location: 'service-worker.js:getConfig',
      message: 'extension config fetch ok',
      data: { apiHost, status: res.status, hasGemini: !!remote.geminiApiKey, hasQbClientId: !!remote.qbClientId },
    });
    // #endregion
    return merged;
  } catch (e) {
    logErr('Config fetch failed, using fallback', e);
    // #region agent log
    debugAgentLog({
      hypothesisId: 'E',
      location: 'service-worker.js:getConfig',
      message: 'extension config fetch failed',
      data: { apiHost: (bootstrap.frontendUrl || bootstrap.backendUrl || '').replace(/\/$/, ''), err: String(e?.message || e) },
    });
    // #endregion
    if (configCache?.data) return { ...configCache.data, ...bootstrap };
    return { ...bootstrap, geminiApiKey: '', qbClientId: '' };
  }
}

async function getSession() {
  const { session } = await chrome.storage.local.get('session');
  if (!session) return null;
  // Auto-refresh if access_token expires within 5 minutes
  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  if (expiresAt && Date.now() > expiresAt - 5 * 60 * 1000) {
    if (session.refresh_token) {
      try {
        log('getSession: access_token expiring, refreshing…');
        const refreshed = await supabaseAuth('token?grant_type=refresh_token', {
          refresh_token: session.refresh_token,
        });
        await saveSession(refreshed);
        log('getSession: token refreshed OK');
        return refreshed;
      } catch (e) {
        logErr('getSession: token refresh failed', e);
      }
    }
  }
  return session;
}

// Track the last broadcast signed-in state so token-refresh writes don't
// re-broadcast SESSION_CHANGED (which previously caused the sidepanel to
// re-run loaders on every silent refresh — double-load bug root cause #2).
let _lastBroadcastSignedIn = null;

// ═════════════════════════════════════════════════════════════
//  Overlay visibility — sidepanel-open liveness signal
//
//  The sidepanel opens a long-lived port 'kyriq-sidepanel' on load. While
//  that port is connected, we treat Kyriq as "open" and broadcast
//  KYRIQ_UI_STATE to every Intuit tab so the content script can decide
//  whether to render the footer bar + floating buttons.
//
//  Visibility modes (persisted in chrome.storage.local.kyriqOverlayMode):
//    - 'whenOpen' (default): show overlay only when the sidepanel is open
//    - 'always':             always show, regardless of sidepanel state
//    - 'never':              never show
// ═════════════════════════════════════════════════════════════
let _sidepanelOpen = false;
const _sidepanelPorts = new Set();

function getOverlayModeSync() {
  return _cachedOverlayMode || 'whenOpen';
}
let _cachedOverlayMode = 'whenOpen';
chrome.storage.local.get('kyriqOverlayMode').then(({ kyriqOverlayMode }) => {
  if (kyriqOverlayMode) _cachedOverlayMode = kyriqOverlayMode;
}).catch(() => {});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.kyriqOverlayMode) {
    _cachedOverlayMode = changes.kyriqOverlayMode.newValue || 'whenOpen';
    broadcastOverlayState();
  }
});

async function broadcastOverlayState() {
  const payload = {
    type: 'KYRIQ_UI_STATE',
    sidepanelOpen: _sidepanelOpen,
    overlayMode: getOverlayModeSync(),
  };
  try {
    const tabs = await chrome.tabs.query({ url: 'https://*.intuit.com/*' });
    for (const tab of tabs) {
      if (tab.id != null) chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
    }
  } catch (e) {
    // No tabs-permission in some contexts — silent.
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'kyriq-sidepanel') return;
  _sidepanelPorts.add(port);
  _sidepanelOpen = true;
  broadcastOverlayState();
  port.onDisconnect.addListener(() => {
    _sidepanelPorts.delete(port);
    _sidepanelOpen = _sidepanelPorts.size > 0;
    broadcastOverlayState();
  });
});

async function saveSession(session) {
  const prevSignedIn = _lastBroadcastSignedIn;
  const signedIn = !!session;
  await chrome.storage.local.set({ session });
  if (prevSignedIn !== signedIn) {
    _lastBroadcastSignedIn = signedIn;
    chrome.runtime.sendMessage({ type: 'SESSION_CHANGED', signedIn }).catch(() => {});
  }
}

async function clearSessionAndNotify() {
  const prevSignedIn = _lastBroadcastSignedIn;
  await chrome.storage.local.remove('session');
  if (prevSignedIn !== false) {
    _lastBroadcastSignedIn = false;
    chrome.runtime.sendMessage({ type: 'SESSION_CHANGED', signedIn: false }).catch(() => {});
  }
}

// ── Supabase helpers ─────────────────────────────────────────
async function supabaseRequest(path, options = {}) {
  const cfg = getBootstrapConfig();
  const session = await getSession();

  const headers = {
    'Content-Type': 'application/json',
    apikey: cfg.supabaseAnonKey,
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Supabase error ${res.status}`);
  }
  // 204 No Content (upsert merge) returns empty body — .json() throws on empty string
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function supabaseAuth(endpoint, body) {
  const cfg = getBootstrapConfig();
  log(`supabaseAuth → ${endpoint}`);
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    logErr(`supabaseAuth failed (${endpoint})`, data.error_description || data.msg);
    throw new Error(data.error_description || data.msg || 'Auth failed');
  }
  log(`supabaseAuth success (${endpoint})`);
  return data;
}

// ── Tenant lookup (handles both 'user_profiles' and 'profiles' table names) ──
async function getTenantId(userId) {
  let rows = await supabaseRequest(`user_profiles?id=eq.${userId}&select=tenant_id`).catch(() => []);
  if (!rows?.length) {
    log('getTenantId: user_profiles empty, trying profiles table');
    rows = await supabaseRequest(`profiles?id=eq.${userId}&select=tenant_id`).catch(() => []);
  }
  if (!rows?.length) throw new Error('No user profile found — ensure user_profiles or profiles table exists');
  return rows[0].tenant_id;
}

// ── QB API helpers ───────────────────────────────────────────
async function getActiveConnection() {
  const session = await getSession();
  if (!session) throw new Error('Not logged in');

  const tenantId = await getTenantId(session.user.id);

  const conns = await supabaseRequest(
    `qb_connections?tenant_id=eq.${tenantId}&is_active=eq.true&select=*`,
    { method: 'GET' }
  );
  if (!conns?.length) throw new Error('No active QB connection');

  return { ...conns[0], tenantId };
}

async function getValidQBToken() {
  const conn = await getActiveConnection();
  const expiresAt = new Date(conn.token_expires_at);
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

  if (expiresAt > fiveMinFromNow) {
    return { token: conn.access_token, realmId: conn.realm_id, tenantId: conn.tenantId, connId: conn.id };
  }

  // Proxy token refresh through Next.js (frontendUrl) — QB client secret stays server-side.
  // /api/extension/qb/refresh-token is a Next.js route, not the Python backend.
  const bootstrap = getBootstrapConfig();
  const apiHost = (bootstrap.frontendUrl || bootstrap.backendUrl || '').replace(/\/$/, '');
  if (!apiHost) throw new Error('Frontend URL not configured — check extension settings');
  const session = await getSession();
  const res = await fetch(`${apiHost}/api/extension/qb/refresh-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ connectionId: conn.id, refreshToken: conn.refresh_token }),
  });

  if (!res.ok) {
    let errDetail = '';
    try { const errBody = await res.json(); errDetail = errBody?.error || errBody?.detail || ''; } catch (_) {}
    // 400/401 from Intuit = refresh token expired (invalid_grant) → must re-authorize
    if (res.status === 400 || res.status === 401) throw new Error('QB_RECONNECT_NEEDED');
    // 404 = the /api/extension/qb/refresh-token route is not deployed on the frontend yet.
    // Always fall back to existing token — let Intuit decide if it's still valid.
    // If Intuit rejects it (401), that error surfaces as QB_RECONNECT_NEEDED via qbApiRequest.
    if (res.status === 404) {
      log('⚠️ refresh-token endpoint returned 404 (not deployed) — using existing token as fallback', { expiresAt: expiresAt.toISOString() });
      return { token: conn.access_token, realmId: conn.realm_id, tenantId: conn.tenantId, connId: conn.id };
    }
    throw new Error(`Token refresh failed (${res.status})${errDetail ? ': ' + errDetail : ''}`);
  }
  const newTokens = await res.json();

  // Save refreshed tokens back to qb_connections
  await supabaseRequest(
    `qb_connections?id=eq.${conn.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        access_token: newTokens.accessToken,
        refresh_token: newTokens.refreshToken,
        token_expires_at: new Date(Date.now() + newTokens.expiresIn * 1000).toISOString(),
      }),
    }
  );

  return { token: newTokens.accessToken, realmId: conn.realm_id, tenantId: conn.tenantId, connId: conn.id };
}

async function qbApiRequest(endpoint, method = 'GET', body = null) {
  const { token, realmId } = await getValidQBToken();
  const url = `https://quickbooks.api.intuit.com/v3/company/${realmId}/${endpoint}`;
  const opts = {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const rawBody = await res.text().catch(() => '');
    let parsed = {};
    try { parsed = JSON.parse(rawBody); } catch {}
    const detail  = parsed?.Fault?.Error?.[0]?.Detail  || '';
    const message = parsed?.Fault?.Error?.[0]?.Message || `QB API error ${res.status}`;
    const e = new Error(detail || message);
    e.qbFault  = parsed;
    e.qbStatus = res.status;
    e.qbRaw    = rawBody;
    throw e;
  }
  return res.json();
}

/**
 * Paginated QB IDS query helper. Walks STARTPOSITION in 1000-row pages.
 * Returns { ok, status, detail, txns } — the shape pullQBTransactions expects.
 */
async function qboQueryAll(baseQuery, entityKey) {
  const PAGE_SIZE = 1000;
  const all = [];
  let startPosition = 1;
  try {
    while (true) {
      const paged = `${baseQuery} STARTPOSITION ${startPosition} MAXRESULTS ${PAGE_SIZE}`;
      const data = await qbApiRequest(`query?query=${encodeURIComponent(paged)}&minorversion=73`);
      const rows = data?.QueryResponse?.[entityKey] || [];
      all.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      startPosition += PAGE_SIZE;
    }
    return { ok: true, status: 200, detail: null, txns: all };
  } catch (e) {
    const status = e?.qbStatus || 500;
    const detail = e?.qbFault?.Fault?.Error?.[0]?.Detail || e?.message || 'unknown';
    return { ok: false, status, detail, txns: [] };
  }
}

// QB Online page path by transaction type (used to build "View in QB" links)
const QB_TXN_PATH = {
  Purchase:    'expense',
  BillPayment: 'billpayment',
  Check:       'check',
  Payment:     'payment',
  Deposit:     'deposit',
};

function qbTxnUrl(realmId, txnType, intuitId) {
  const path = QB_TXN_PATH[txnType] || 'transaction';
  return `https://app.qbo.intuit.com/app/${path}?txnId=${intuitId}`;
}

/**
 * Build the PrivateNote memo stamped on QB transactions when Kyriq approves them.
 * Structured as labelled field: value lines so it's readable inside QB.
 * Any pre-existing PrivateNote is preserved above a --- divider.
 * A previous Kyriq block is replaced rather than appended.
 *
 * @param {object} entity   - The QB entity as returned by the read call
 * @param {object} checkData - Extracted check fields from Kyriq (may be null)
 * @param {object} qbTxn    - The qb_entries row from Supabase (may be null)
 */
function buildKyriqNote(entity, checkData, qbTxn) {
  const today = new Date().toISOString().split('T')[0];

  // Resolve each field — prefer live QB entity, fall back to qb_entries cache, then OCR extraction.
  // Use safeStr for checkData fields since they may be { value, confidence } objects.
  const fields = [];

  const checkNum = entity.DocNumber || qbTxn?.doc_number || safeStr(checkData?.check_number);
  if (checkNum) fields.push(['Check #',  String(checkNum)]);

  const txnDate  = entity.TxnDate    || qbTxn?.txn_date   || safeStr(checkData?.check_date);
  if (txnDate)  fields.push(['Date',     txnDate]);

  const payee    = entity.EntityRef?.name || qbTxn?.payee || safeStr(checkData?.payee);
  if (payee)    fields.push(['Payee',    payee]);

  const rawAmt   = entity.TotalAmt    ?? qbTxn?.amount     ?? checkData?.amount;
  if (rawAmt != null) fields.push(['Amount',  `$${parseFloat(rawAmt).toFixed(2)}`]);

  const account  = entity.AccountRef?.name || qbTxn?.account;
  if (account)  fields.push(['Account',  account]);

  const bankName = safeStr(checkData?.bank_name);
  const routing  = safeStr(checkData?.routing_number);
  const acctRaw  = safeStr(checkData?.account_number);
  const memo     = safeStr(checkData?.memo) || safeStr(entity.PrivateMemo);

  if (bankName)  fields.push(['Bank',    bankName]);
  if (routing)   fields.push(['Routing', routing]);
  if (acctRaw)   fields.push(['Acct #',  acctRaw.length > 4 ? `****${acctRaw.slice(-4)}` : acctRaw]);
  if (memo)      fields.push(['Memo',    memo]);

  const kyriqBlock = [
    `[Kyriq] Verified & Cleared: ${today}`,
    ...fields.map(([k, v]) => `${k}: ${v}`),
  ].join('\n');

  // Strip any prior [Kyriq] block (idempotent re-approve), preserve the rest
  const existing = (entity.PrivateNote || '')
    .replace(/\n?---\n\[Kyriq\][\s\S]*$/, '')
    .replace(/\[Kyriq\][\s\S]*$/, '')
    .trim();

  return existing ? `${existing}\n---\n${kyriqBlock}` : kyriqBlock;
}

// ── QB Clear Transaction (stamp PrivateNote + classify for Reconcile overlay) ──
//
// The QBO IDS API's ClearedStatus / TxnStatus / ClearStatus fields are READ-ONLY
// (Intuit docs + Satva Solutions research). No sparse update with any of those
// names will set the cleared flag — every entity returns Fault 2010.
//
// The actual "C" tick happens via the content script qbo-overlay.js on the
// /app/reconcile page. This function stamps a Kyriq PrivateNote as the audit
// trail, reads ClearedStatus for classification, and returns a status the UI
// can use to guide the user to QB Reconcile.
const QB_CLEAR_READ_FIELDS = ['ClearedStatus', 'TxnStatus', 'ClearStatus'];

function readClearedStatus(entity) {
  for (const f of QB_CLEAR_READ_FIELDS) {
    const v = entity?.[f];
    if (typeof v === 'string' && v) return v;
  }
  const cp = entity?.CheckPayment;
  if (cp) {
    for (const f of QB_CLEAR_READ_FIELDS) {
      const v = cp[f];
      if (typeof v === 'string' && v) return v;
    }
  }
  return null;
}

function qbAlreadyCleared(entity) {
  const v = readClearedStatus(entity);
  return v === 'Cleared' || v === 'Reconciled' ? v : null;
}

function qbRequiredExtras(txnType, entity) {
  const extra = {};
  if (txnType === 'Purchase')    extra.PaymentType         = entity.PaymentType;
  if (txnType === 'Payment')     extra.CustomerRef         = entity.CustomerRef;
  if (txnType === 'Deposit')     extra.DepositToAccountRef = entity.DepositToAccountRef;
  if (txnType === 'BillPayment') {
    if (entity.VendorRef) extra.VendorRef = entity.VendorRef;
    if (entity.PayType)   extra.PayType   = entity.PayType;
  }
  return extra;
}

/**
 * Stamp Kyriq PrivateNote on a QB transaction and classify for the overlay.
 * Returns:
 *   { status: 'already_cleared' | 'queued_for_reconcile' | 'manual_required',
 *     readOnlyClearedStatus, confirmedNote, noteStamped, result }
 *
 * Throws only for hard errors (network/auth/sync-token/invalid ID).
 */
async function clearQBTransaction(txnType, txnId, checkData = null, qbTxn = null) {
  let readOnlyClearedStatus = null;
  try {
    // 1. GET current entity — can itself fail with 610 if the txn was deleted/inactive.
    const readData = await qbApiRequest(`${txnType.toLowerCase()}/${txnId}?minorversion=73`);
    const entity = readData[txnType] || readData[Object.keys(readData)[0]];
    if (!entity) throw new Error('Transaction not found in QB');
    readOnlyClearedStatus = readClearedStatus(entity);

    // 2. Build payload + POST sparse update — can fail with 610 if a referenced entity is inactive.
    const privateNote = buildKyriqNote(entity, checkData, qbTxn);
    const payload = {
      Id: entity.Id,
      SyncToken: entity.SyncToken,
      sparse: true,
      PrivateNote: privateNote,
      ...qbRequiredExtras(txnType, entity),
    };
    const result = await qbApiRequest(`${txnType.toLowerCase()}?minorversion=73`, 'POST', payload);

    // QB occasionally returns HTTP 200 with a Fault body — route it through the same catch below.
    if (result?.Fault) {
      throw Object.assign(
        new Error(result.Fault?.Error?.[0]?.Detail || result.Fault?.Error?.[0]?.Message || 'QB fault'),
        { qbFault: result, qbRaw: JSON.stringify(result) }
      );
    }

    const updated = result[txnType] || result[Object.keys(result)[0]] || {};
    const confirmedNote = updated.PrivateNote || null;
    const noteStamped = (confirmedNote || '').includes('[Kyriq]');
    const already = qbAlreadyCleared(entity);
    if (already)                   return { status: 'already_cleared',      readOnlyClearedStatus, result, confirmedNote, noteStamped };
    if (txnType === 'BillPayment') return { status: 'manual_required',      readOnlyClearedStatus, result, confirmedNote, noteStamped };
    return                                { status: 'queued_for_reconcile', readOnlyClearedStatus, result, confirmedNote, noteStamped };

  } catch (e) {
    // 610 can come from EITHER the GET (txn deleted) or the POST (linked entity inactive).
    const faultCode = e?.qbFault?.Fault?.Error?.[0]?.code;
    const msgHint   = e?.message && (e.message.includes('made inactive') || e.message.includes('Object Not Found'));
    if (faultCode === '610' || msgHint) {
      log('clearQBTransaction: 610 inactive entity — returning inactive_entity', { txnType, txnId });
      return {
        status: 'inactive_entity',
        warning: 'A vendor, account, or other entity linked to this QB transaction has been made inactive in QuickBooks. Reactivate it and re-approve. (QB error 610)',
        readOnlyClearedStatus,
        confirmedNote: null,
        noteStamped: false,
      };
    }
    throw e;
  }
}

// ── OCR via Gemini API ───────────────────────────────────────
async function extractCheckData(imageBase64, mimeType) {
  const cfg = await getConfig();
  if (!cfg.geminiApiKey) throw new Error('Gemini API key not configured');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${cfg.geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: { mime_type: mimeType, data: imageBase64 },
            },
            {
              text: `Extract the following from this check image. Return ONLY a JSON object with these fields:
{
  "check_number": "string or null",
  "check_date": "YYYY-MM-DD or null",
  "amount": number or null,
  "payee": "string or null",
  "memo": "string or null",
  "bank_name": "string or null",
  "payer": "string or null"
}
If a field cannot be read, use null. For amount, return a number (e.g. 1234.56). Do NOT include any other text.`,
            },
          ],
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 500 },
      }),
    }
  );

  if (!res.ok) throw new Error('Gemini API failed');
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse OCR result');
  return JSON.parse(jsonMatch[0]);
}

// ── Matching Algorithm ───────────────────────────────────────
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function stringSimilarity(a, b) {
  if (!a || !b) return 0;
  const s1 = a.toLowerCase().trim(), s2 = b.toLowerCase().trim();
  if (s1 === s2) return 100;
  const maxLen = Math.max(s1.length, s2.length);
  return maxLen === 0 ? 100 : Math.round((1 - levenshtein(s1, s2) / maxLen) * 100);
}

function scoreMatch(check, qbTxn) {
  const reasons = { amount: 0, checkNumber: 0, date: 0, payee: 0 };
  const flags = [];

  // Amount (40pts)
  const cAmt = parseFloat(check.amount) || 0;
  const qAmt = parseFloat(qbTxn.amount) || 0;
  const diff = Math.abs(cAmt - qAmt);
  if (diff === 0) reasons.amount = 40;
  else if (diff <= 0.01) reasons.amount = 38;
  else if (diff <= 1) reasons.amount = 25;
  else if (diff <= 10) reasons.amount = 15;
  else if (diff <= 50) reasons.amount = 5;
  if (diff > 0.01) flags.push({ type: 'amount', diff, message: `Amount differs by $${diff.toFixed(2)}` });

  // Check number (30pts)
  const cn1 = String(check.check_number || '').replace(/\D/g, '').replace(/^0+/, '');
  const cn2 = String(qbTxn.doc_number || '').replace(/\D/g, '').replace(/^0+/, '');
  if (cn1 && cn2 && cn1 === cn2) reasons.checkNumber = 30;
  else if (cn1 && cn2 && (cn1.endsWith(cn2) || cn2.endsWith(cn1))) reasons.checkNumber = 10;

  // Date (15pts) — parse all common formats to UTC ms without timezone risk
  if (check.check_date && qbTxn.txn_date) {
    const MO = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
    const parseUTCDay = (s) => {
      const t = String(s).trim();
      // YYYY-MM-DD or YYYY-M-D (ISO, with optional time)
      const ymd = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (ymd) return Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3]);
      // MM/DD/YYYY or M/D/YYYY — swap if first part >12
      const mdy = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (mdy) {
        const a = +mdy[1], b = +mdy[2], y = +mdy[3];
        return a > 12 ? Date.UTC(y, b - 1, a) : Date.UTC(y, a - 1, b);
      }
      // MMM D, YYYY or MMM DD YYYY (e.g. "Mar 23, 2026")
      const mmmdy = t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
      if (mmmdy) {
        const mo = MO[mmmdy[1].toLowerCase().slice(0,3)];
        if (mo !== undefined) return Date.UTC(+mmmdy[3], mo, +mmmdy[2]);
      }
      // D MMM YYYY or DD MMM YYYY (e.g. "23 Mar 2026")
      const dmmy = t.match(/^(\d{1,2})\s+([A-Za-z]{3,9}),?\s+(\d{4})$/);
      if (dmmy) {
        const mo = MO[dmmy[2].toLowerCase().slice(0,3)];
        if (mo !== undefined) return Date.UTC(+dmmy[3], mo, +dmmy[1]);
      }
      // DD-MMM-YYYY (e.g. "23-Mar-2026")
      const ddmmy = t.match(/^(\d{1,2})-([A-Za-z]{3,9})-(\d{4})$/);
      if (ddmmy) {
        const mo = MO[ddmmy[2].toLowerCase().slice(0,3)];
        if (mo !== undefined) return Date.UTC(+ddmmy[3], mo, +ddmmy[1]);
      }
      // Fallback — locale strings parse as local midnight; use local getters
      const d = new Date(t);
      if (isNaN(d.getTime())) return null;
      return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    };
    const t1 = parseUTCDay(check.check_date);
    const t2 = parseUTCDay(qbTxn.txn_date);
    if (t1 !== null && t2 !== null) {
      const days = Math.abs(t1 - t2) / 86400000;
      if (days === 0) reasons.date = 15;
      else if (days <= 1) reasons.date = 12;
      else if (days <= 3) reasons.date = 8;
      else if (days <= 7) reasons.date = 4;
      else if (days <= 14) reasons.date = 1;
    }
  }

  // Payee (15pts)
  const sim = stringSimilarity(check.payee, qbTxn.payee);
  if (sim === 100) reasons.payee = 15;
  else if (sim >= 85) reasons.payee = 12;
  else if (sim >= 70) reasons.payee = 8;
  else if (sim >= 50) reasons.payee = 4;

  const score = Math.min(reasons.amount + reasons.checkNumber + reasons.date + reasons.payee, 100);
  return { score, reasons, flags, amtDiff: diff };
}

function statusFromScore(score, flags) {
  const hasAmtMismatch = flags.some(f => f.type === 'amount' && f.diff > 0.01);
  if (score === 0) return 'unmatched';
  if (hasAmtMismatch && score >= 60) return 'discrepancy';
  if (score >= 95) return 'matched';
  return 'pending';
}

// ── Pull QB transactions ─────────────────────────────────────
async function pullQBTransactions() {
  const { token, realmId, tenantId } = await getValidQBToken();
  // Wider window so older cheques still match (30d was too small for typical reconciliation).
  const pullLookbackDays = 365;
  const windowStart = new Date(Date.now() - pullLookbackDays * 86400000).toISOString().split('T')[0];

  const queries = [
    { q: `SELECT * FROM Purchase WHERE PaymentType = 'Check' AND TxnDate >= '${windowStart}'`, key: 'Purchase', type: 'Purchase', source: 'cheque_written' },
    { q: `SELECT * FROM BillPayment WHERE TxnDate >= '${windowStart}'`, key: 'BillPayment', type: 'BillPayment', source: 'bill_paid_by_cheque' },
  ];

  // Fetch all transaction types in parallel for faster sync
  const allTxns = [];
  const partialErrors = [];
  const fetchPromises = queries.map(async ({ q, key, type, source }) => {
    try {
      const result = await qboQueryAll(q, key);
      if (!result.ok) {
        logErr(`QB Intuit API ${result.status} for ${type} — sync will be incomplete: ${result.detail}`);
        partialErrors.push({ type, status: result.status, detail: result.detail });
        if (result.status === 401) throw new Error('QB_RECONNECT_NEEDED');
        return [];
      }
      let txns = result.txns;
      // BillPayment: QB IDS does not support PayType in WHERE clause — filter client-side
      if (type === 'BillPayment') txns = txns.filter(t => (t.PayType || '').toLowerCase() === 'check');
      return txns.map(t => {
        // Type-specific payee + bank account extraction.
        // BillPayment: vendor is VendorRef; bank account is nested under CheckPayment.BankAccountRef
        // (not BankAccountRef directly — that field belongs to Check/Purchase only).
        let payee, account;
        if (type === 'BillPayment') {
          payee   = t.VendorRef?.name || null;
          account = t.CheckPayment?.BankAccountRef?.name || t.APAccountRef?.name || null;
        } else if (type === 'Purchase') {
          payee   = t.EntityRef?.name || null;
          account = t.AccountRef?.name || null;
        } else { // Check (payroll / direct disbursement)
          payee   = t.PayeeRef?.name || t.EntityRef?.name || null;
          account = t.BankAccountRef?.name || t.AccountRef?.name || null;
        }
        return {
          tenant_id: tenantId,
          realm_id: realmId,
          txn_id: `${type.toLowerCase()}-${t.Id}`,
          txn_type: type,
          qb_source: source,
          txn_date: t.TxnDate,
          payee,
          amount: t.TotalAmt,
          memo: t.PrivateNote || null,
          doc_number: t.DocNumber || null,
          account,
          ...(type === 'BankTransaction' ? { account_ref_id: t.AccountRef?.value, is_pending: true } : {}),
        };
      });
    } catch (e) {
      if (e.message === 'QB_RECONNECT_NEEDED') throw e; // bubble up — PULL_QB_TXNS handler shows reconnect banner
      console.warn(`QB query failed for ${type}:`, e.message);
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  results.forEach(txns => allTxns.push(...txns));

  // #region agent log
  debugAgentLog({
    hypothesisId: 'H1',
    location: 'service-worker.js:pullQBTransactions',
    message: 'intuit query window + per-type counts',
    data: {
      realmId,
      windowStart,
      pullLookbackDays,
      counts: queries.map((q, i) => ({ type: q.type, n: (results[i] || []).length })),
      totalFetched: allTxns.length,
    },
  });
  // #endregion

  // Upsert to Supabase — qb_entries FIRST (canonical table for matching), qb_transactions SECOND (non-fatal).
  // IMPORTANT: the web app pull-checks.ts uses the same pattern. The old order (qb_transactions first
  // with `throw e`) meant any qb_transactions failure silently blocked qb_entries from ever being written.
  if (allTxns.length > 0) {
    const session = await getSession();
    allTxns.forEach(t => { t.user_id = session.user.id; });

    // ── 1. qb_entries (primary — matching reads from here) ────────────────────
    const allQBEntries = allTxns.map(t => ({
      id:           t.txn_id,
      intuit_id:    t.txn_id.split('-').slice(1).join('-'),
      tenant_id:    t.tenant_id,
      qb_type:      t.txn_type,
      qb_source:    t.qb_source,
      check_number: t.doc_number || '',
      date:         t.txn_date  || '',
      amount:       t.amount != null ? String(t.amount) : '0',
      payee:        t.payee   || '',
      account:      t.account || '',
      memo:         t.memo    || '',
      synced_at:    new Date().toISOString(),
    }));
    try {
      await supabaseRequest('qb_entries?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(allQBEntries),
      });
      log(`pullQBTransactions: qb_entries upserted ${allQBEntries.length} rows`);
    } catch (entryErr) {
      logErr('pullQBTransactions: qb_entries upsert failed', entryErr);
      throw entryErr; // qb_entries is the critical table — surface the error
    }

    // ── 2. qb_transactions (secondary — non-fatal; missing constraint OK) ─────
    try {
      await supabaseRequest('qb_transactions?on_conflict=tenant_id,realm_id,txn_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(allTxns),
      });
      // #region agent log
      debugAgentLog({
        hypothesisId: 'H2',
        location: 'service-worker.js:pullQBTransactions',
        message: 'supabase qb_transactions upsert ok',
        data: { rowCount: allTxns.length },
      });
      // #endregion
    } catch (txnErr) {
      // #region agent log
      debugAgentLog({
        hypothesisId: 'H2',
        location: 'service-worker.js:pullQBTransactions',
        message: 'supabase qb_transactions upsert failed (non-fatal — qb_entries already written)',
        data: { err: String(txnErr?.message || txnErr), rowCount: allTxns.length },
      });
      // #endregion
      logErr('pullQBTransactions: qb_transactions upsert failed (non-fatal)', txnErr);
      // Do NOT throw — qb_entries was already written successfully above
    }
  }

  return { txns: allTxns, partialErrors };
}

// ── Run full matching ────────────────────────────────────────
async function runFullMatch(extractedChecks) {
  const { tenantId, realmId } = await getActiveConnection();
  const session = await getSession();

  // qb_entries is the canonical source (561+ records). qb_transactions is empty (extension-only legacy store).
  const entries = await supabaseRequest(
    `qb_entries?tenant_id=eq.${tenantId}&select=id,intuit_id,check_number,date,amount,payee,account,memo,qb_source,qb_type&order=date.desc&limit=5000`,
    { method: 'GET' }
  ).catch(() => []);

  // Normalise to the shape scoreMatch expects — same mapping as GET_QB_TXNS
  const qbTxns = (entries || []).map(e => ({
    id: e.id,
    txn_id: e.id,
    intuit_id: e.intuit_id || String(e.id).split('-').slice(1).join('-') || null,
    txn_type: e.qb_type || e.qb_source || 'Entry',
    qb_source: e.qb_source || null,
    txn_date: e.date,
    payee: e.payee,
    amount: e.amount,
    memo: e.memo,
    doc_number: e.check_number,
    account: e.account,
  }));

  // #region agent log
  debugAgentLog({
    hypothesisId: 'H3',
    location: 'service-worker.js:runFullMatch',
    message: 'supabase qb_entries for matching',
    data: { tenantId, qbRowCount: qbTxns.length, checkCount: extractedChecks?.length ?? 0 },
  });
  // #endregion

  // Build fast-lookup indices to avoid O(n²) brute-force over 1000+ entries
  const byCheckNum = new Map();   // normalised check# → array of qbTxns indices
  const byAmtBucket = new Map();  // Math.floor(cents/1000) i.e. $10 bucket → array of indices
  qbTxns.forEach((txn, idx) => {
    const cn = String(txn.doc_number || '').replace(/\D/g, '').replace(/^0+/, '');
    if (cn) {
      if (!byCheckNum.has(cn)) byCheckNum.set(cn, []);
      byCheckNum.get(cn).push(idx);
    }
    const bucket = Math.floor(Math.round(parseFloat(txn.amount || 0) * 100) / 1000);
    if (!byAmtBucket.has(bucket)) byAmtBucket.set(bucket, []);
    byAmtBucket.get(bucket).push(idx);
  });

  const results = [];
  for (const check of extractedChecks) {
    const cn = String(check.check_number || '').replace(/\D/g, '').replace(/^0+/, '');
    const bucket = Math.floor(Math.round(parseFloat(check.amount || 0) * 100) / 1000);

    // Gather candidates: check-number matches + amount within ±$20 (adjacent $10 buckets)
    const candidateSet = new Set();
    if (cn && byCheckNum.has(cn)) {
      for (const i of byCheckNum.get(cn)) candidateSet.add(i);
    }
    for (let b = bucket - 1; b <= bucket + 1; b++) {
      if (byAmtBucket.has(b)) {
        for (const i of byAmtBucket.get(b)) candidateSet.add(i);
      }
    }

    // Terminal statuses from the DB always win over score-derived ones
    const TERMINAL = ['approved', 'rejected', 'exported'];
    const persistedStatus = TERMINAL.includes(check.status) ? check.status : null;

    if (candidateSet.size === 0) {
      results.push({ check, qbTxn: null, score: 0, reasons: {}, flags: [], status: persistedStatus || 'unmatched', amtDiff: 0 });
      continue;
    }

    let bestMatch = null, bestScore = 0, bestResult = null;
    for (const idx of candidateSet) {
      const result = scoreMatch(check, qbTxns[idx]);
      if (result.score > bestScore) {
        bestScore = result.score;
        bestMatch = qbTxns[idx];
        bestResult = result;
      }
    }

    if (bestScore >= 40 && bestMatch && bestResult) {
      results.push({
        check,
        qbTxn: bestMatch,
        score: bestScore,
        reasons: bestResult.reasons,
        flags: bestResult.flags,
        status: persistedStatus || statusFromScore(bestScore, bestResult.flags),
        amtDiff: bestResult.amtDiff,
      });
    } else {
      results.push({ check, qbTxn: null, score: 0, reasons: {}, flags: [], status: persistedStatus || 'unmatched', amtDiff: 0 });
    }
  }

  return results;
}

// ── Message handler ──────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = async () => {
    try {
      switch (msg.type) {
        case 'SIGNUP': {
          log('SIGNUP', { email: msg.email, company: msg.companyName });
          const data = await supabaseAuth('signup', {
            email: msg.email,
            password: msg.password,
            data: { company_name: msg.companyName || '' },
          });
          if (data.user) {
            log('SIGNUP success, auto-logging in');
            const loginData = await supabaseAuth('token?grant_type=password', {
              email: msg.email, password: msg.password,
            });
            await saveSession(loginData);
            await chrome.storage.local.remove('configCache');
            return { success: true, user: loginData.user, session: loginData };
          }
          return { success: true, needsConfirmation: true };
        }
        case 'LOGIN': {
          log('LOGIN', { email: msg.email });
          const data = await supabaseAuth('token?grant_type=password', {
            email: msg.email, password: msg.password,
          });
          await saveSession(data);
          await chrome.storage.local.remove('configCache');
          log('LOGIN success', { userId: data.user?.id });
          return { success: true, user: data.user, session: data };
        }
        case 'LOGOUT': {
          log('LOGOUT');
          await clearSessionAndNotify();
          return { success: true };
        }
        case 'GET_SESSION': {
          const s = await getSession();
          log('GET_SESSION', { hasSession: !!s, userId: s?.user?.id });
          return { session: s };
        }
        case 'GET_CONFIG': {
          return await getConfig();
        }
        case 'REFRESH_CONFIG': {
          await chrome.storage.local.remove('configCache');
          const cfg = await getConfig();
          return { success: true, config: cfg };
        }
        case 'GET_QB_AUTH_URL': {
          const bootstrap = getBootstrapConfig();
          // /api/qbo/auth is a Next.js route — must use frontendUrl, not the Python backendUrl
          const qbAuthHost = (bootstrap.frontendUrl || bootstrap.backendUrl || '').replace(/\/$/, '');
          if (!qbAuthHost) return { error: 'Frontend URL not set' };
          const url = `${qbAuthHost}/api/qbo/auth?source=extension`;
          log('GET_QB_AUTH_URL', url);
          return { url };
        }
        case 'OPEN_QB_AUTH': {
          const s = await getSession();
          if (!s?.access_token) return { error: 'Not logged in. Please sign in first.' };
          const bootstrap = getBootstrapConfig();
          // Use frontendUrl (kyriq.com) first — it has the correct registered redirect_uri.
          // Fall back to backendUrl if frontendUrl is not set.
          const qbAuthHost = (bootstrap.frontendUrl || bootstrap.backendUrl || '').replace(/\/$/, '');
          if (!qbAuthHost) return { error: 'No frontend or backend URL configured' };
          log('OPEN_QB_AUTH: fetching Intuit auth URL from', qbAuthHost);
          try {
            const apiRes = await fetch(`${qbAuthHost}/api/qbo/auth?source=extension`, {
              headers: { 'Authorization': `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
            });
            const data = await apiRes.json();
            if (!apiRes.ok || !data.authUrl) {
              logErr('OPEN_QB_AUTH: error from ' + qbAuthHost, data.error || data.detail || data.message);
              return { error: data.detail || data.error || data.message || `Server returned ${apiRes.status}` };
            }
            log('OPEN_QB_AUTH: opening Intuit OAuth page', data.authUrl);
            await chrome.tabs.create({ url: data.authUrl });
            return { success: true, url: data.authUrl };
          } catch (e) {
            logErr('OPEN_QB_AUTH fetch failed', e);
            return { error: `Network error: ${e.message}` };
          }
        }
        case 'GET_CONNECTIONS': {
          log('GET_CONNECTIONS');
          const s = await getSession();
          if (!s) return { connections: [] };
          let tenantId = null;
          try {
            tenantId = await getTenantId(s.user.id);
          } catch (profileErr) {
            logErr('GET_CONNECTIONS: getTenantId failed', profileErr);
            return { connections: [], error: 'Profile not found — ensure user_profiles row exists for this user' };
          }
          if (!tenantId) { log('GET_CONNECTIONS: no profile found'); return { connections: [] }; }
          try {
            const conns = await supabaseRequest(
              `qb_connections?tenant_id=eq.${tenantId}&select=id,realm_id,company_name,is_active,connected_at&order=connected_at.asc`
            );
            log('GET_CONNECTIONS result', { count: conns?.length || 0, tenantId });
            return { connections: conns || [] };
          } catch (connErr) {
            logErr('GET_CONNECTIONS: Supabase qb_connections query failed', connErr);
            return { connections: [], error: connErr.message };
          }
        }
        case 'SWITCH_COMPANY': {
          const s = await getSession();
          if (!s) return { error: 'Not logged in' };
          if (!msg.realmId) return { error: 'realmId is required' };
          const tid = await getTenantId(s.user.id);
          log('SWITCH_COMPANY', { realmId: msg.realmId, tenantId: tid });
          try {
            // Deactivate all connections for this tenant
            await supabaseRequest(`qb_connections?tenant_id=eq.${tid}`, {
              method: 'PATCH', body: JSON.stringify({ is_active: false }),
            });
            // Activate only the selected company
            await supabaseRequest(`qb_connections?tenant_id=eq.${tid}&realm_id=eq.${msg.realmId}`, {
              method: 'PATCH', body: JSON.stringify({ is_active: true }),
            });
            // Read back the active connection to confirm and return details
            const activeConns = await supabaseRequest(
              `qb_connections?tenant_id=eq.${tid}&realm_id=eq.${msg.realmId}&select=id,realm_id,company_name,is_active`
            ).catch(() => []);
            const activeConnection = activeConns?.[0] || null;
            log(`SWITCH_COMPANY: switched to realm ${msg.realmId}`, { confirmed: !!activeConnection });
            return { success: true, activeConnection };
          } catch (e) {
            logErr('SWITCH_COMPANY failed', e);
            return { error: e.message };
          }
        }
        case 'DISCONNECT_QB': {
          log('DISCONNECT_QB');
          const s = await getSession();
          if (!s) return { error: 'Not logged in' };
          try {
            const tid = await getTenantId(s.user.id);
            await supabaseRequest(`qb_connections?tenant_id=eq.${tid}`, {
              method: 'PATCH',
              body: JSON.stringify({ is_active: false }),
            });
            log('DISCONNECT_QB: all connections marked inactive', { tenantId: tid });
            return { success: true };
          } catch (e) {
            logErr('DISCONNECT_QB failed', e);
            return { error: e.message };
          }
        }
        case 'GET_DOCUMENTS': {
          log('GET_DOCUMENTS');
          const s = await getSession();
          if (!s?.access_token) return { documents: [] };
          const bootstrap = getBootstrapConfig();
          const backendUrl = bootstrap.backendUrl?.replace(/\/$/, '') || '';
          if (!backendUrl) return { documents: [] };
          try {
            const res = await fetch(`${backendUrl}/api/jobs?limit=200&source=auto`, {
              headers: { Authorization: `Bearer ${s.access_token}` },
            });
            if (!res.ok) throw new Error(`Backend /api/jobs returned ${res.status}`);
            const data = await res.json();
            const docs = (data.jobs || []).map(j => ({
              id: j.id,
              job_id: j.job_id,
              pdf_name: j.pdf_name || 'Untitled',
              status: j.status,
              total_checks: j.total_checks || 0,
              total_pages: j.total_pages || 0,
              created_at: j.created_at,
            }));
            log('GET_DOCUMENTS result', { count: docs.length });
            return { documents: docs };
          } catch (e) {
            logErr('GET_DOCUMENTS failed', e);
            return { documents: [], error: e.message };
          }
        }
        case 'GET_CHECKS': {
          log('GET_CHECKS');
          const s = await getSession();
          if (!s?.access_token) return { checks: [] };
          const bootstrap = getBootstrapConfig();
          const backendUrl = bootstrap.backendUrl?.replace(/\/$/, '') || '';
          if (!backendUrl) return { checks: [] };
          try {
            // Fetch all jobs then extract checks from job.checks array
            const res = await fetch(`${backendUrl}/api/jobs?limit=200&source=auto`, {
              headers: { Authorization: `Bearer ${s.access_token}` },
            });
            if (!res.ok) throw new Error(`Backend /api/jobs returned ${res.status}`);
            const data = await res.json();
            const checks = [];
            for (const job of (data.jobs || [])) {
              // Backend returns 'checks' (parsed array), not 'checks_data' (raw JSON string)
              const checksData = Array.isArray(job.checks)
                ? job.checks
                : (typeof job.checks_data === 'string'
                  ? JSON.parse(job.checks_data || '[]')
                  : (job.checks_data || []));
              for (const c of checksData) {
                const ext = c.extraction || {};
                const rawAmt = safeStr(ext.amount) || '0';
                checks.push({
                  id: c.check_id,
                  job_id: job.job_id,
                  check_number: safeStr(ext.checkNumber),
                  amount: parseFloat(rawAmt.replace(/[^0-9.]/g, '')) || null,
                  payee: safeStr(ext.payee),
                  check_date: safeStr(ext.checkDate),
                  bank_name: safeStr(ext.bankName),
                  memo: safeStr(ext.memo),
                  account_number: safeStr(ext.accountNumber),
                  routing_number: safeStr(ext.routingNumber),
                  image_url: c.image_url || null,
                  status: c.status || 'pending_review',
                  source_file: job.pdf_name,
                  page_number: c.page_number || null,
                });
              }
            }
            log('GET_CHECKS result', { count: checks.length });
            _swChecksCache = checks;
            return { checks };
          } catch (e) {
            logErr('GET_CHECKS failed', e);
            return { checks: [], error: e.message };
          }
        }
        case 'GET_HISTORY': {
          log('GET_HISTORY');
          const s = await getSession();
          if (!s) return { history: [] };
          const tenantId = await getTenantId(s.user.id).catch(() => null);
          if (!tenantId) return { history: [] };
          // Only select columns that exist in the live checks schema
          // job_id and source_file are NOT in the live checks table
          const hist = await supabaseRequest(
            `checks?tenant_id=eq.${tenantId}&status=eq.approved&select=id,check_number,amount,payee,check_date,status,realm_id&order=updated_at.desc&limit=50`
          ).catch(() => []);
          log('GET_HISTORY result', { count: hist?.length || 0 });
          return { history: hist || [] };
        }
        case 'GET_QB_ACCOUNTS': {
          log('GET_QB_ACCOUNTS');
          const s = await getSession();
          if (!s) return { accounts: [] };
          const bootstrap = getBootstrapConfig();
          const accounts = new Set();
          // Try QB API first (live accounts list)
          try {
            const { token, realmId } = await getValidQBToken();
            const qbRes = await fetch(
              `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Bank'")}&minorversion=73`,
              { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
            );
            if (qbRes.ok) {
              const qbData = await qbRes.json();
              (qbData?.QueryResponse?.Account || []).forEach(a => {
                if (a.Name) accounts.add(a.Name);
              });
              log('GET_QB_ACCOUNTS: QB API ok', { count: accounts.size });
            }
          } catch (qbErr) {
            log('GET_QB_ACCOUNTS: QB API unavailable, using transaction data fallback', qbErr.message);
          }
          // Fallback: derive from already-synced qb_entries (filtered by tenant)
          if (accounts.size === 0) {
            try {
              const tenantId = await getTenantId(s.user.id).catch(() => null);
              const filter = tenantId ? `tenant_id=eq.${tenantId}&` : '';
              const entries = await supabaseRequest(
                `qb_entries?${filter}select=account&order=date.desc&limit=500`
              ).catch(() => []);
              (entries || []).forEach(e => { if (e.account) accounts.add(e.account); });
              log('GET_QB_ACCOUNTS: fallback from qb_entries', { count: accounts.size, tenantId });
            } catch (_) {}
          }
          return { accounts: Array.from(accounts).sort() };
        }
        case 'DELETE_DOCUMENT': {
          log('DELETE_DOCUMENT', { jobId: msg.jobId });
          const s = await getSession();
          if (!s?.access_token) return { error: 'Not logged in' };
          const bootstrap = getBootstrapConfig();
          const frontendUrl = (bootstrap.frontendUrl || bootstrap.backendUrl || '').replace(/\/$/, '');
          if (!frontendUrl || !msg.jobId) return { error: 'Missing frontendUrl or jobId' };
          try {
            const res = await fetch(`${frontendUrl}/api/jobs/${msg.jobId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${s.access_token}` },
            });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              return { error: errData.error || `Delete failed (${res.status})` };
            }
            log('DELETE_DOCUMENT success', { jobId: msg.jobId });
            return { success: true };
          } catch (e) {
            logErr('DELETE_DOCUMENT failed', e);
            return { error: e.message };
          }
        }
        case 'GET_QB_TXNS': {
          log('GET_QB_TXNS');
          const s = await getSession();
          // Return richer status so the sidepanel can distinguish:
          //   not_authed       → "Sign in to Kyriq to load QB data"
          //   no_tenant        → "Profile has no tenant — contact admin"
          //   fetch_failed     → "Could not reach Supabase — try Refresh"
          //   empty            → "No QB transactions yet — click Sync"
          //   ok               → render the list
          if (!s) return { txns: [], status: 'not_authed' };
          const tenantIdQb = await getTenantId(s.user.id).catch(() => null);
          if (!tenantIdQb) {
            log('GET_QB_TXNS: no tenant_id for user');
            return { txns: [], status: 'no_tenant' };
          }
          let entries;
          try {
            entries = await supabaseRequest(
              `qb_entries?tenant_id=eq.${tenantIdQb}&select=id,intuit_id,check_number,date,amount,payee,account,memo,qb_source,qb_type&order=date.desc&limit=5000`
            );
          } catch (fetchErr) {
            logErr('GET_QB_TXNS: supabase fetch failed', fetchErr);
            return { txns: [], status: 'fetch_failed', error: fetchErr?.message || 'fetch failed' };
          }
          const txns = (entries || []).map(e => ({
            id: e.id,
            txn_id: e.id,
            intuit_id: e.intuit_id || String(e.id).split('-').slice(1).join('-') || null,
            txn_type: e.qb_type || e.qb_source || 'Entry',
            qb_source: e.qb_source || null,
            txn_date: e.date,
            payee: e.payee,
            amount: e.amount,
            memo: e.memo,
            doc_number: e.check_number,
            account: e.account,
          }));
          log('GET_QB_TXNS result', { count: txns.length, tenantId: tenantIdQb });
          return { txns, status: txns.length ? 'ok' : 'empty', tenantId: tenantIdQb };
        }
        case 'SAVE_QB_TXN': {
          log('SAVE_QB_TXN', { txnId: msg.txnId, txnType: msg.txnType, fields: msg.fields });
          const s = await getSession();
          if (!s?.access_token) return { error: 'Not logged in' };
          try {
            const tenantId = await getTenantId(s.user.id).catch(() => null);
            if (!tenantId) return { error: 'No tenant_id' };

            // 1. Update local Supabase cache (qb_entries is the canonical table)
            const cacheId = msg.txnId || msg.qbTxn?.id;
            if (cacheId) {
              await supabaseRequest(
                `qb_entries?id=eq.${encodeURIComponent(cacheId)}&tenant_id=eq.${tenantId}`,
                { method: 'PATCH', body: JSON.stringify({ ...msg.fields, synced_at: new Date().toISOString() }) }
              ).catch(e => logErr('SAVE_QB_TXN: local cache update skipped', e));
            }

            // 2. Also push edits to QuickBooks if we have type + Intuit ID
            const txnType = msg.txnType || msg.qbTxn?.txn_type;
            // Prefer intuit_id from the full qbTxn object; fall back to explicit msg.qbIntuitId or parsing txnId
            let qbIntuitId = msg.qbTxn?.intuit_id || msg.qbIntuitId || null;
            if (!qbIntuitId && cacheId) {
              const parts = String(cacheId).split('-');
              qbIntuitId = parts.slice(1).join('-') || null;
            }
            if (txnType && qbIntuitId) {
              try {
                const readData = await qbApiRequest(`${txnType.toLowerCase()}/${qbIntuitId}?minorversion=73`);
                const entity = readData[txnType] || readData[Object.keys(readData)[0]];
                if (entity) {
                  const updates = {};
                  if (msg.fields.txn_date) updates.TxnDate = msg.fields.txn_date;
                  if (msg.fields.amount != null) updates.TotalAmt = msg.fields.amount;
                  if (msg.fields.payee) updates.PrivateNote = `[Kyriq edit] Payee: ${msg.fields.payee}\n${entity.PrivateNote || ''}`.trim();
                  if (msg.fields.doc_number) updates.DocNumber = msg.fields.doc_number;
                  if (Object.keys(updates).length > 0) {
                    // Sparse update: only send Id + SyncToken + changed fields.
                    // Sending the full entity ({ ...entity, ...updates }) triggers QB error 6070
                    // ("Operation fileimport not supported") when the entity has AttachableRef,
                    // RecurDataRef, or Line[].LinkedTxn — fields QB won't accept in write ops.
                    await qbApiRequest(`${txnType.toLowerCase()}?minorversion=73`, 'POST', {
                      Id: entity.Id,
                      SyncToken: entity.SyncToken,
                      sparse: true,
                      ...updates,
                    });
                    log('SAVE_QB_TXN: QB entity updated', { txnType, qbIntuitId });
                  }
                }
              } catch (qbErr) {
                logErr('SAVE_QB_TXN: QB update failed (Supabase still saved)', qbErr);
                return { success: true, qbWarning: qbErr.message, qbRaw: qbErr.qbRaw || null, qbStatus: qbErr.qbStatus || null };
              }
            }

            return { success: true };
          } catch (e) {
            logErr('SAVE_QB_TXN failed', e);
            return { error: e.message };
          }
        }
        case 'UPDATE_CHECK_FIELDS': {
          log('UPDATE_CHECK_FIELDS', { checkId: msg.checkId, fields: msg.fields });
          const s = await getSession();
          if (!s?.access_token) return { error: 'Not logged in' };
          const bootstrap = getBootstrapConfig();
          // /api/jobs/... routes are in Next.js (frontendUrl), NOT the Python backendUrl
          const fieldsHost = (bootstrap.frontendUrl || bootstrap.backendUrl || '').replace(/\/$/, '');
          try {
            if (fieldsHost && msg.jobId) {
              const res = await fetch(`${fieldsHost}/api/jobs/${msg.jobId}/checks/${msg.checkId}/fields`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
                body: JSON.stringify(msg.fields),
              });
              if (res.ok) return { success: true };
            }
            // check_0182-style IDs live in jobs.checks_data JSON, NOT in checks table (UUID PK)
            // No valid fallback exists — log and succeed silently
            logErr('UPDATE_CHECK_FIELDS: jobId missing, cannot update job check', { checkId: msg.checkId });
            return { success: true, warning: 'Fields not persisted: jobId required' };
          } catch (e) {
            logErr('UPDATE_CHECK_FIELDS failed', e);
            return { error: e.message };
          }
        }
        case 'UPDATE_CHECK_STATUS': {
          // Updates a check's status (approve/reject) via the Next.js job endpoint
          // Falls back to direct Supabase PATCH on checks.check_id if route unavailable
          log('UPDATE_CHECK_STATUS', { checkId: msg.checkId, status: msg.status });
          const s = await getSession();
          if (!s?.access_token) return { error: 'Not logged in' };

          // Patch in-memory cache immediately so subsequent RUN_MATCHING calls are consistent
          if (_swChecksCache && msg.checkId && msg.status) {
            const cached = _swChecksCache.find(c => c.id === msg.checkId || c.check_id === msg.checkId);
            if (cached) cached.status = msg.status;
          }

          const bootstrap = getBootstrapConfig();
          // /api/jobs/... routes are in Next.js (frontendUrl), NOT the Python backendUrl
          const statusHost = (bootstrap.frontendUrl || bootstrap.backendUrl || '').replace(/\/$/, '');
          try {
            // Try Next.js route first (operates on jobs.checks_data JSON)
            if (statusHost && msg.jobId) {
              const res = await fetch(`${statusHost}/api/jobs/${msg.jobId}/checks/${msg.checkId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
                body: JSON.stringify({ status: msg.status }),
              });
              if (res.ok) return { success: true };
            }
            // check_0182-style IDs live in jobs.checks_data JSON, NOT in checks table (UUID PK)
            // No valid fallback exists — log and succeed silently
            logErr('UPDATE_CHECK_STATUS: jobId missing, cannot update job check', { checkId: msg.checkId, status: msg.status });
            return { success: true, warning: 'Status not persisted: jobId required' };
          } catch (e) {
            logErr('UPDATE_CHECK_STATUS failed', e);
            return { error: e.message };
          }
        }
        case 'UPLOAD_DOCUMENT': {
          log('UPLOAD_DOCUMENT', { name: msg.fileName, size: msg.fileSize });
          const s = await getSession();
          if (!s?.access_token) return { error: 'Not logged in' };
          const bootstrap = getBootstrapConfig();
          const backendUrl = bootstrap.backendUrl?.replace(/\/$/, '') || '';
          if (!backendUrl) return { error: 'Backend URL not configured' };
          try {
            // Reconstruct file from base64
            const bytes = Uint8Array.from(atob(msg.fileBase64), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const form = new FormData();
            form.append('file', blob, msg.fileName || 'document.pdf');
            const res = await fetch(`${backendUrl}/api/upload-analyze`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${s.access_token}` },
              body: form,
            });
            const data = await res.json();
            if (!res.ok) return { error: data.detail || data.error || `Upload failed (${res.status})` };
            log('UPLOAD_DOCUMENT success', { job_id: data.job_id });
            return { success: true, job_id: data.job_id, job: data };
          } catch (e) {
            logErr('UPLOAD_DOCUMENT failed', e);
            return { error: e.message };
          }
        }
        case 'POLL_JOB': {
          const bootstrap = getBootstrapConfig();
          const backendUrl = bootstrap.backendUrl?.replace(/\/$/, '') || '';
          if (!backendUrl || !msg.jobId) return { error: 'Missing backendUrl or jobId' };
          try {
            const pollSession = await getSession();
            const pollHeaders = pollSession?.access_token ? { Authorization: `Bearer ${pollSession.access_token}` } : {};
            const res = await fetch(`${backendUrl}/api/jobs/${msg.jobId}?source=auto`, { headers: pollHeaders });
            const data = await res.json();
            return { success: true, job: data };
          } catch (e) {
            logErr('POLL_JOB failed', e);
            return { error: e.message };
          }
        }
        case 'START_EXTRACTION': {
          log('START_EXTRACTION', { jobId: msg.jobId, methods: msg.methods });
          const bootstrap = getBootstrapConfig();
          const backendUrl = bootstrap.backendUrl?.replace(/\/$/, '') || '';
          if (!backendUrl) return { error: 'Backend URL not configured' };
          try {
            const extSession = await getSession();
            const extHeaders = { 'Content-Type': 'application/json' };
            if (extSession?.access_token) extHeaders['Authorization'] = `Bearer ${extSession.access_token}`;
            const res = await fetch(`${backendUrl}/api/start-extraction`, {
              method: 'POST',
              headers: extHeaders,
              body: JSON.stringify({
                job_id: msg.jobId,
                methods: msg.methods || ['hybrid'],
                force: true,
              }),
            });
            const data = await res.json();
            if (!res.ok) return { error: data.detail || data.error || `Extraction failed (${res.status})` };
            log('START_EXTRACTION success', { job_id: msg.jobId });
            return { success: true, job: data };
          } catch (e) {
            logErr('START_EXTRACTION failed', e);
            return { error: e.message };
          }
        }
        case 'PULL_QB_TXNS': {
          log('PULL_QB_TXNS start');
          try {
            const { txns: pullTxns, partialErrors } = await pullQBTransactions();
            log('PULL_QB_TXNS done', { count: pullTxns.length, partialErrors });
            return { success: true, count: pullTxns.length, partialErrors: partialErrors || [] };
          } catch (pullErr) {
            if (pullErr.message === 'QB_RECONNECT_NEEDED') {
              logErr('PULL_QB_TXNS: QB authorization expired — reconnect required', pullErr);
              return { error: 'QuickBooks authorization has expired. Please reconnect.', reconnectNeeded: true };
            }
            if (pullErr.message === 'QB_ENDPOINT_NOT_DEPLOYED') {
              logErr('PULL_QB_TXNS: refresh-token endpoint not found on kyriq.com — frontend needs to be deployed', pullErr);
              return { error: 'Token refresh endpoint not found on kyriq.com. Please deploy the latest frontend build.', endpointMissing: true };
            }
            throw pullErr;
          }
        }
        case 'EXTRACT_CHECK': {
          log('EXTRACT_CHECK', { mimeType: msg.mimeType });
          const result = await extractCheckData(msg.imageBase64, msg.mimeType);
          log('EXTRACT_CHECK done', result);
          return { success: true, data: result };
        }
        case 'RUN_MATCHING': {
          const checksToMatch = (_swChecksCache?.length ? _swChecksCache : msg.checks) || [];
          log('RUN_MATCHING', { checksCount: checksToMatch.length, fromCache: !msg.checks });
          const matches = await runFullMatch(checksToMatch);
          log('RUN_MATCHING done', { matchCount: matches?.length });
          // #region agent log
          const withQb = (matches || []).filter((m) => m.qbTxn).length;
          debugAgentLog({
            hypothesisId: 'H3',
            location: 'service-worker.js:RUN_MATCHING',
            message: 'match result summary',
            data: {
              checks: checksToMatch.length,
              results: matches?.length ?? 0,
              withQbTxn: withQb,
              topScores: (matches || []).slice(0, 5).map((m) => m.score),
            },
          });
          // #endregion
          return { success: true, matches };
        }
        case 'APPROVE_AND_CLEAR': {
          const { qbTxn } = msg;
          if (!qbTxn) return { success: false, error: 'No QB transaction provided' };

          const txnType = qbTxn.txn_type;
          // Prefer the stored intuit_id (added in migration 022); fall back to parsing txn_id
          let qbIntuitId = qbTxn.intuit_id || null;
          if (!qbIntuitId && qbTxn.txn_id) {
            const parts = String(qbTxn.txn_id).split('-');
            qbIntuitId = parts.slice(1).join('-') || null;
          }

          if (!txnType || !qbIntuitId) {
            log('APPROVE_AND_CLEAR: missing QB identifiers — marking approved locally only');
            // #region agent log
            debugAgentLog({
              hypothesisId: 'H4',
              location: 'service-worker.js:APPROVE_AND_CLEAR',
              message: 'missing txn identifiers',
              data: { hasType: !!txnType, hasIntuitId: !!qbIntuitId, txn_id_prefix: qbTxn.txn_id ? String(qbTxn.txn_id).slice(0, 24) : null },
            });
            // #endregion
            // Still persist approval to DB and notify UI even without QB link
            if (msg.checkId) {
              const s0 = await getSession();
              if (s0?.access_token) {
                const bs0 = getBootstrapConfig();
                const h0 = (bs0.frontendUrl || bs0.backendUrl || '').replace(/\/$/, '');
                if (h0 && msg.jobId) {
                  fetch(`${h0}/api/jobs/${msg.jobId}/checks/${msg.checkId}/status`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s0.access_token}` },
                    body: JSON.stringify({ status: 'approved' }),
                  }).catch(() => {});
                }
              }
            }
            chrome.runtime.sendMessage({ type: 'CHECK_UPDATED', checkId: msg.checkId, jobId: msg.jobId, status: 'approved', cleared: false }).catch(() => {});
            return { success: true, cleared: false, warning: 'QB transaction not linked — approved in Kyriq only' };
          }

          // Save approval status via Next.js status route (handles jobs.checks_data JSON)
          const saveCheckApproval = async (checkId, jobId) => {
            if (!checkId) return;

            // Immediately patch the in-memory cache so RUN_MATCHING sees 'approved'
            // without waiting for a full re-fetch from the backend.
            if (_swChecksCache) {
              const cached = _swChecksCache.find(c => c.id === checkId || c.check_id === checkId);
              if (cached) cached.status = 'approved';
            }

            const s2 = await getSession();
            if (!s2?.access_token) return;
            const bootstrap2 = getBootstrapConfig();
            const approvalHost = (bootstrap2.frontendUrl || bootstrap2.backendUrl || '').replace(/\/$/, '');
            if (approvalHost && jobId) {
              try {
                await fetch(`${approvalHost}/api/jobs/${jobId}/checks/${checkId}/status`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s2.access_token}` },
                  body: JSON.stringify({ status: 'approved' }),
                });
              } catch (dbErr) {
                logErr('APPROVE_AND_CLEAR: status route failed (non-critical)', dbErr);
              }
            } else {
              // jobId missing — check_0182 IDs are in jobs.checks_data JSON, not in checks table
              logErr('APPROVE_AND_CLEAR: jobId missing, approval status not persisted to DB', { checkId });
            }
          };

          // Skip QB API entirely for file-import entries — they have no Intuit record to update
          const isFileImport = (qbTxn.qb_type === 'FileImport' || qbTxn.txn_type === 'FileImport' || qbTxn.qb_source === 'qbo_file_upload');
          if (isFileImport) {
            await saveCheckApproval(msg.checkId, msg.jobId);
            chrome.runtime.sendMessage({ type: 'CHECK_UPDATED', checkId: msg.checkId, jobId: msg.jobId, status: 'approved', cleared: false }).catch(() => {});
            return { success: true, cleared: false, warning: 'File import entry — approval saved in Kyriq. No QB Online update needed.' };
          }

          // BankTransaction (pending bank feed item) — create a Purchase in QB to confirm/categorize it.
          // The newly-created Purchase is NOT yet cleared in QB; it must be ticked via the overlay
          // on /app/reconcile (same as any other Purchase). Push its new intuit_id onto kyriqApproved
          // so the overlay picks it up.
          const isBankFeed = txnType === 'BankTransaction';
          if (isBankFeed) {
            try {
              const bankAmt = parseFloat(qbTxn.amount) || 0;
              const purchasePayload = {
                PaymentType: 'Check',
                AccountRef: { name: qbTxn.account || 'Checking' },
                TxnDate: qbTxn.txn_date,
                DocNumber: qbTxn.doc_number || '',
                TotalAmt: bankAmt,
                Line: [{
                  DetailType: 'AccountBasedExpenseLineDetail',
                  Amount: bankAmt,
                  AccountBasedExpenseLineDetail: {
                    AccountRef: { name: 'Uncategorized Expense' },
                  },
                }],
              };
              const created = await qbApiRequest('purchase?minorversion=73', 'POST', purchasePayload);
              const newPurchase = created?.Purchase || created?.[Object.keys(created)[0]] || {};
              const newIntuitId = newPurchase.Id || null;
              log(`APPROVE_AND_CLEAR: created Purchase from BankTransaction -> new intuit_id=${newIntuitId}`);

              // Queue the new Purchase for the Reconcile overlay to auto-tick.
              try {
                const stored = await chrome.storage.local.get('kyriqApproved');
                const map = stored.kyriqApproved || {};
                if (newIntuitId) {
                  map[String(newIntuitId)] = {
                    intuit_id: String(newIntuitId),
                    txn_type: 'Purchase',
                    doc_number: qbTxn.doc_number || null,
                    amount: bankAmt,
                    payee: qbTxn.payee || null,
                    txn_date: qbTxn.txn_date || null,
                    approved_at: new Date().toISOString(),
                    source: 'bank_feed_to_purchase',
                  };
                  await chrome.storage.local.set({ kyriqApproved: map });
                }
              } catch (storeErr) {
                logErr('APPROVE_AND_CLEAR: failed to queue new Purchase for overlay', storeErr);
              }

              await saveCheckApproval(msg.checkId, msg.jobId);
              chrome.runtime.sendMessage({ type: 'CHECK_UPDATED', checkId: msg.checkId, jobId: msg.jobId, status: 'approved', cleared: false, qbStatus: 'queued_for_reconcile' }).catch(() => {});
              return {
                success: true,
                cleared: false,
                qbStatus: 'queued_for_reconcile',
                txnType: 'Purchase',
                newIntuitId,
                warning: 'Bank feed item converted to a Purchase in QB. Open QB Reconcile and click "Auto-Clear Kyriq Approved" to tick the C.',
              };
            } catch (e) {
              logErr('APPROVE_AND_CLEAR: BankTransaction -> Purchase creation failed', e);
              await saveCheckApproval(msg.checkId, msg.jobId);
              chrome.runtime.sendMessage({ type: 'CHECK_UPDATED', checkId: msg.checkId, jobId: msg.jobId, status: 'approved', cleared: false, qbStatus: 'failed' }).catch(() => {});
              return { success: true, cleared: false, qbStatus: 'failed', warning: `QB not updated: ${e.message}. Approved in Kyriq — manually categorize this bank transaction in QB.`, qbRaw: e.qbRaw || null };
            }
          }

          // Persist approved QB txn to local storage so content script can
          // auto-check the reconciliation page without another API round-trip.
          const storeKyriqApproved = async () => {
            try {
              const stored = await chrome.storage.local.get('kyriqApproved');
              const map = stored.kyriqApproved || {};
              map[String(qbIntuitId)] = {
                intuit_id: String(qbIntuitId),
                txn_type: txnType,
                doc_number: qbTxn.doc_number || null,
                amount: parseFloat(qbTxn.amount) || null,
                payee: qbTxn.payee || null,
                txn_date: qbTxn.txn_date || null,
                approved_at: new Date().toISOString(),
              };
              await chrome.storage.local.set({ kyriqApproved: map });
            } catch (e) {
              logErr('storeKyriqApproved: storage write failed (non-critical)', e);
            }
          };

          try {
            const clearResult = await clearQBTransaction(txnType, qbIntuitId, msg.check || null, qbTxn);
            const { confirmedNote, noteStamped, status: qbStatus, readOnlyClearedStatus } = clearResult;
            const didClear = qbStatus === 'already_cleared';
            log(`APPROVE_AND_CLEAR: ${qbStatus} ${txnType} #${qbIntuitId} in QB`, { noteStamped, readOnlyClearedStatus });
            // #region agent log
            debugAgentLog({
              hypothesisId: 'H4',
              location: 'service-worker.js:APPROVE_AND_CLEAR',
              message: `qb clear ${qbStatus}`,
              data: { txnType, intuitIdLen: String(qbIntuitId).length, readOnlyClearedStatus },
            });
            // #endregion
            // Log QB clear action to audit_logs (general-purpose table, confirmed in live schema)
            // match_audit_log requires match_id FK and has no tenant_id — wrong table for this flow
            try {
              const s3 = await getSession();
              const tid3 = s3 ? await getTenantId(s3.user.id).catch(() => null) : null;
              if (tid3) {
                await supabaseRequest(
                  'audit_logs',
                  {
                    method: 'POST',
                    body: JSON.stringify({
                      tenant_id: tid3,
                      action: `qb_${qbStatus}`,
                      entity_type: 'qb_transaction',
                      // check_id is UUID column — put text check_id in metadata instead
                      metadata: {
                        txn_type: txnType,
                        intuit_id: qbIntuitId,
                        check_id: msg.checkId || null,
                        check_number: qbTxn.doc_number || null,
                        qb_status: qbStatus,
                        read_only_cleared_status: readOnlyClearedStatus || null,
                        cleared_at: new Date().toISOString(),
                      },
                    }),
                  }
                );
              }
            } catch (auditErr) {
              logErr('APPROVE_AND_CLEAR: audit log write failed (non-critical)', auditErr);
            }
            await storeKyriqApproved();
            await saveCheckApproval(msg.checkId, msg.jobId);
            const { realmId: rId } = await getValidQBToken().catch(() => ({}));
            const qbUrl = rId ? qbTxnUrl(rId, txnType, qbIntuitId) : null;
            chrome.runtime.sendMessage({ type: 'CHECK_UPDATED', checkId: msg.checkId, jobId: msg.jobId, status: 'approved', cleared: didClear, qbStatus }).catch(() => {});
            const warning =
              qbStatus === 'already_cleared'      ? 'QB already has this transaction cleared.' :
              qbStatus === 'manual_required'      ? 'Bill Payment cleared-status cannot be set via API. Open QB Reconcile and tick it manually.' :
              qbStatus === 'queued_for_reconcile' ? 'Open QB Reconcile and click "Auto-Clear Kyriq Approved" to tick the C.' :
              qbStatus === 'inactive_entity'      ? 'A linked vendor or account is inactive in QuickBooks. Reactivate it and re-approve to stamp the note.' :
              undefined;
            return {
              success: true,
              cleared: didClear,
              qbStatus,
              readOnlyClearedStatus,
              txnType,
              qbUrl,
              confirmedNote,
              noteStamped,
              warning,
            };
          } catch (e) {
            logErr('APPROVE_AND_CLEAR QB clear failed — approving locally only', e);
            // #region agent log
            debugAgentLog({
              hypothesisId: 'H4',
              location: 'service-worker.js:APPROVE_AND_CLEAR',
              message: 'qb clear error — local-only approve',
              data: { txnType, err: String(e?.message || e) },
            });
            // #endregion
            // Local-only approve: record status in DB but warn user that QB was not cleared.
            // Still store in local map so the reconciliation page can auto-check the row.
            await storeKyriqApproved().catch(() => {});
            await saveCheckApproval(msg.checkId, msg.jobId);
            chrome.runtime.sendMessage({ type: 'CHECK_UPDATED', checkId: msg.checkId, jobId: msg.jobId, status: 'approved', cleared: false, qbStatus: 'failed' }).catch(() => {});
            return { success: true, cleared: false, qbStatus: 'failed', warning: `QB not cleared: ${e.message}`, qbRaw: e.qbRaw || null, qbHttpStatus: e.qbStatus || null };
          }
        }
        case 'SEARCH_QB': {
          const { tenantId: tid2 } = await getActiveConnection();
          // qb_entries is the canonical store (written by /api/qbo/pull-checks); qb_transactions is empty
          // encodeURIComponent the query so spaces and special chars don't break the PostgREST filter
          const safeQuery = encodeURIComponent(msg.query || '');
          const results = await supabaseRequest(
            `qb_entries?tenant_id=eq.${tid2}&or=(payee.ilike.%25${safeQuery}%25,check_number.ilike.%25${safeQuery}%25)&order=date.desc&limit=20`
          ).catch(() => []);
          return { results: results || [] };
        }

        // Content-script pulls the current UI visibility state on load
        // (the broadcast `KYRIQ_UI_STATE` only fires on change; late-injected
        // content scripts need an initial snapshot).
        case 'GET_KYRIQ_UI_STATE': {
          return {
            sidepanelOpen: _sidepanelOpen,
            overlayMode: getOverlayModeSync(),
          };
        }

        // Open (or focus) the QB Online Reconcile page. Called by the sidepanel
        // toast CTA and can be called from the content script overlay too.
        case 'OPEN_QB_RECONCILE': {
          const RECONCILE_URL = 'https://app.qbo.intuit.com/app/reconcile';
          try {
            // Focus an existing Reconcile tab if one is already open.
            const tabs = await chrome.tabs.query({ url: 'https://app.qbo.intuit.com/app/reconcile*' });
            if (tabs && tabs.length > 0) {
              await chrome.tabs.update(tabs[0].id, { active: true });
              if (tabs[0].windowId) await chrome.windows.update(tabs[0].windowId, { focused: true });
              return { success: true, focused: true, tabId: tabs[0].id };
            }
            const tab = await chrome.tabs.create({ url: RECONCILE_URL });
            return { success: true, focused: false, tabId: tab.id };
          } catch (e) {
            logErr('OPEN_QB_RECONCILE failed', e);
            return { success: false, error: e?.message || String(e) };
          }
        }

        // ── Return Kyriq-approved QB transactions for content script UI ──
        // Used by qbo-overlay.js to auto-clear rows on the reconciliation page.
        // Merges: (1) locally stored approvals from this session's APPROVE_AND_CLEAR calls,
        //         (2) all qb_entries whose intuit_id or check_number matches an approved check.
        case 'GET_KYRIQ_APPROVED': {
          // (1) Local approvals stored during this/previous sessions
          const stored = await chrome.storage.local.get('kyriqApproved').catch(() => ({}));
          const localMap = stored.kyriqApproved || {};

          // (2) Pull qb_entries for the active tenant so we can cross-ref with cached checks
          const s = await getSession();
          if (!s) return { approved: Object.values(localMap) };
          const tenantId = await getTenantId(s.user.id).catch(() => null);
          if (!tenantId) return { approved: Object.values(localMap) };

          const [entries, checksRes] = await Promise.all([
            supabaseRequest(
              `qb_entries?tenant_id=eq.${tenantId}&select=id,intuit_id,check_number,date,amount,payee,qb_type&limit=5000`
            ).catch(() => []),
            // Re-use cached checks if available
            Promise.resolve(_swChecksCache || []),
          ]);

          const approvedChecks = checksRes.filter(c => c.status === 'approved');

          // Build lookup by check_number and amount for fast matching
          const approvedByNum = {};
          const approvedByAmt = {};
          for (const c of approvedChecks) {
            if (c.check_number) approvedByNum[String(c.check_number).replace(/^0+/, '')] = c;
            if (c.amount) {
              const key = Math.abs(parseFloat(c.amount)).toFixed(2);
              if (!approvedByAmt[key]) approvedByAmt[key] = c;
            }
          }

          // Merge: any qb_entry that matches an approved check gets added to the map
          for (const e of (entries || [])) {
            if (!e.intuit_id) continue;
            const id = String(e.intuit_id);
            if (localMap[id]) continue; // already have it from local store

            const num = String(e.check_number || '').replace(/^0+/, '');
            const amt = e.amount != null ? Math.abs(parseFloat(e.amount)).toFixed(2) : null;

            const matched = approvedByNum[num] || (amt ? approvedByAmt[amt] : null);
            if (matched) {
              localMap[id] = {
                intuit_id: id,
                txn_type: e.qb_type || 'Purchase',
                doc_number: e.check_number || null,
                amount: parseFloat(e.amount) || null,
                payee: e.payee || null,
                txn_date: e.date || null,
                approved_at: matched.check_date || null,
              };
            }
          }

          return { approved: Object.values(localMap) };
        }

        // ── Return the matched Kyriq check for a given QB txnId (used by Smart Fill) ──
        // Called from the content script on transaction-detail pages. Looks up
        // the approved/matched Kyriq check by intuit_id (from kyriqApproved map
        // first, then by joining qb_entries→checks on check_number/amount).
        case 'GET_KYRIQ_MATCH_FOR_TXN': {
          const intuitId = String(msg.intuitId || '').trim();
          if (!intuitId) return { match: null };
          try {
            const stored = await chrome.storage.local.get('kyriqApproved');
            const localMap = stored.kyriqApproved || {};
            const localHit = localMap[intuitId];

            const s = await getSession();
            if (!s) return { match: localHit || null };
            const tenantId = await getTenantId(s.user.id).catch(() => null);
            if (!tenantId) return { match: localHit || null };

            // Fetch the qb_entry to get check_number / amount for cross-joining
            const entries = await supabaseRequest(
              `qb_entries?tenant_id=eq.${tenantId}&intuit_id=eq.${intuitId}&select=intuit_id,check_number,amount,payee,account,memo,date,qb_type&limit=1`
            ).catch(() => []);
            const entry = (entries || [])[0];
            if (!entry) return { match: localHit || null };

            const checkNum = String(entry.check_number || '').replace(/^0+/, '');
            const amtKey = entry.amount != null ? Math.abs(parseFloat(entry.amount)).toFixed(2) : null;
            // Match against approved Kyriq checks (with full extraction fields)
            const approvedFilters = [];
            if (checkNum) approvedFilters.push(`check_number.eq.${encodeURIComponent(checkNum)}`);
            if (amtKey)   approvedFilters.push(`amount.eq.${amtKey}`);
            if (!approvedFilters.length) return { match: localHit || null };

            const checks = await supabaseRequest(
              `checks?tenant_id=eq.${tenantId}&status=eq.approved&or=(${approvedFilters.join(',')})&select=check_number,check_date,amount,payee,memo,bank_name,account_number,routing_number&limit=1`
            ).catch(() => []);
            const check = (checks || [])[0];

            return {
              match: {
                intuit_id: intuitId,
                qb_type: entry.qb_type,
                qb_entry: entry,
                kyriq_check: check || null,
                local_approved: localHit || null,
              },
            };
          } catch (e) {
            logErr('GET_KYRIQ_MATCH_FOR_TXN failed', e);
            return { match: null, error: e?.message || String(e) };
          }
        }

        // ── Wipe local approval store (e.g. on logout / company switch) ──
        case 'CLEAR_KYRIQ_APPROVED': {
          await chrome.storage.local.remove('kyriqApproved').catch(() => {});
          return { success: true };
        }

        default:
          return { error: 'Unknown message type' };
      }
    } catch (err) {
      logErr(`Message handler error [${msg.type}]`, err);
      return { error: err.message };
    }
  };

  handler().then(sendResponse);
  return true; // keep message channel open for async
});

// ── Detect QB OAuth completion from extension tab ────────────
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  const url = tab.url || '';
  if (!url.includes('/qb-oauth-complete')) return;

  log('QB OAuth complete tab detected — closing and notifying sidepanel', { tabId, url });

  // Extract company name from URL if present
  let company = '';
  try {
    const urlObj = new URL(url);
    company = urlObj.searchParams.get('company') || '';
  } catch (_) {}

  // Close the OAuth tab after a brief delay so the page renders first
  setTimeout(() => {
    chrome.tabs.remove(tabId).catch(() => {});
  }, 1500);

  // Notify all extension views (sidepanel, popup) about the completion
  chrome.runtime.sendMessage({ type: 'QB_OAUTH_COMPLETE', company }).catch(() => {});
});

// ── Badge update ─────────────────────────────────────────────
async function updateBadge() {
  try {
    const session = await getSession();
    if (!session) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }
    const { tenantId } = await getActiveConnection();
    const pending = await supabaseRequest(
      `checks?tenant_id=eq.${tenantId}&status=eq.pending_review&select=id&limit=99`
    );
    const count = pending?.length || 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  } catch {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Update badge periodically
chrome.alarms.create('updateBadge', { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'updateBadge') updateBadge();
});

// Update on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('Kyriq installed');
  updateBadge();
  
  // Enable side panel to open when clicking extension icon
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Side panel setup error:', error));
});
