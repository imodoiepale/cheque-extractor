/**
 * Kyriq — Background Service Worker
 * Handles: Supabase auth, QB API calls, token refresh, matching, clearing transactions
 */

const CONFIG_CACHE_TTL = 3600000; // 1 hour in ms

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

async function saveSession(session) {
  await chrome.storage.local.set({ session });
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
  return res.json();
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
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.Fault?.Error?.[0]?.Detail || `QB API error ${res.status}`);
  }
  return res.json();
}

// ── QB Clear Transaction (mark as Cleared for reconciliation) ──
async function clearQBTransaction(txnType, txnId) {
  // Read current transaction
  const readData = await qbApiRequest(`${txnType.toLowerCase()}/${txnId}?minorversion=65`);
  const entity = readData[txnType] || readData[Object.keys(readData)[0]];
  if (!entity) throw new Error('Transaction not found in QB');

  // QuickBooks uses SyncToken for optimistic locking
  // To "clear" a transaction for reconciliation, we update it with a custom field
  // or the Cleared status. QB API doesn't have a direct "clear" endpoint,
  // but we can mark it by adding a tag or updating the memo.
  // The actual reconciliation clearing happens in QB's reconcile flow.
  // What we CAN do: update the transaction's PrivateNote to indicate it's been verified
  const updatePayload = {
    ...entity,
    PrivateNote: `${entity.PrivateNote || ''}\n[Kyriq] Verified & Cleared ${new Date().toISOString().split('T')[0]}`.trim(),
  };

  const result = await qbApiRequest(
    `${txnType.toLowerCase()}?minorversion=65`,
    'POST',
    updatePayload
  );

  return result;
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
    { q: `SELECT * FROM Check WHERE TxnDate >= '${windowStart}'`, key: 'Check', type: 'Check', source: 'payroll_check' },
  ];

  // Fetch all transaction types in parallel for 3x faster sync
  const allTxns = [];
  const fetchPromises = queries.map(async ({ q, key, type, source }) => {
    try {
      const res = await fetch(
        `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(q)}&minorversion=65`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (res.ok) {
        const data = await res.json();
        let txns = data?.QueryResponse?.[key] || [];
        // BillPayment: QB IDS does not support PayType in WHERE clause — filter client-side
        if (type === 'BillPayment') txns = txns.filter(t => (t.PayType || '').toLowerCase() === 'check');
        return txns.map(t => ({
          tenant_id: tenantId,
          realm_id: realmId,
          // txn_id encodes both type and Intuit Id: "purchase-123", "billpayment-456"
          txn_id: `${type.toLowerCase()}-${t.Id}`,
          txn_type: type,
          txn_date: t.TxnDate,
          // PayeeRef is the primary field for Check entities; fall through to EntityRef/VendorRef for others
          payee: t.PayeeRef?.name || t.EntityRef?.name || t.VendorRef?.name || t.CustomerRef?.name || null,
          amount: t.TotalAmt,
          memo: t.PrivateNote || null,
          doc_number: t.DocNumber || null,
          account: t.BankAccountRef?.name || t.AccountRef?.name || null,
          // qb_id NOT stored — column doesn't exist in qb_transactions schema.
          // Extract Intuit Id from txn_id when needed: txn_id.split('-').slice(1).join('-')
        }));
      }
      return [];
    } catch (e) {
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

  // Upsert to Supabase
  if (allTxns.length > 0) {
    const session = await getSession();
    allTxns.forEach(t => { t.user_id = session.user.id; });
    try {
      await supabaseRequest('qb_transactions', {
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
    } catch (e) {
      // #region agent log
      debugAgentLog({
        hypothesisId: 'H2',
        location: 'service-worker.js:pullQBTransactions',
        message: 'supabase qb_transactions upsert failed',
        data: { err: String(e?.message || e), rowCount: allTxns.length },
      });
      // #endregion
      throw e;
    }
  }

  return allTxns;
}

// ── Run full matching ────────────────────────────────────────
async function runFullMatch(extractedChecks) {
  const { tenantId, realmId } = await getActiveConnection();
  const session = await getSession();

  // qb_entries is the canonical source (561+ records). qb_transactions is empty (extension-only legacy store).
  const entries = await supabaseRequest(
    `qb_entries?tenant_id=eq.${tenantId}&select=id,check_number,date,amount,payee,account,memo,qb_source,qb_type&order=date.desc&limit=1000`,
    { method: 'GET' }
  ).catch(() => []);

  // Normalise to the shape scoreMatch expects — same mapping as GET_QB_TXNS
  const qbTxns = (entries || []).map(e => ({
    id: e.id,
    txn_id: e.check_number || e.id,
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

  const results = [];
  for (const check of extractedChecks) {
    let bestMatch = null, bestScore = 0, bestResult = null;
    for (const txn of qbTxns) {
      const result = scoreMatch(check, txn);
      if (result.score > bestScore) {
        bestScore = result.score;
        bestMatch = txn;
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
        status: statusFromScore(bestScore, bestResult.flags),
        amtDiff: bestResult.amtDiff,
      });
    } else {
      results.push({ check, qbTxn: null, score: 0, reasons: {}, flags: [], status: 'unmatched', amtDiff: 0 });
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
          await chrome.storage.local.remove('session');
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
          const backendUrl = bootstrap.backendUrl?.replace(/\/$/, '') || '';
          if (!backendUrl) return { error: 'Backend URL not set' };
          const url = `${backendUrl}/api/qbo/auth?source=extension`;
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
        case 'GET_DOCUMENTS': {
          log('GET_DOCUMENTS');
          const s = await getSession();
          if (!s?.access_token) return { documents: [] };
          const bootstrap = getBootstrapConfig();
          const backendUrl = bootstrap.backendUrl?.replace(/\/$/, '') || '';
          if (!backendUrl) return { documents: [] };
          try {
            const res = await fetch(`${backendUrl}/api/jobs?limit=200&source=db`, {
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
            const res = await fetch(`${backendUrl}/api/jobs?limit=200&source=db`, {
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
                checks.push({
                  id: c.check_id,
                  job_id: job.job_id,
                  check_number: ext.checkNumber?.value || ext.checkNumber || null,
                  amount: parseFloat((ext.amount?.value || ext.amount || '0').toString().replace(/[^0-9.]/g, '')) || null,
                  payee: ext.payee?.value || ext.payee || null,
                  check_date: ext.checkDate?.value || ext.checkDate || null,
                  bank_name: ext.bankName?.value || ext.bankName || null,
                  memo: ext.memo?.value || ext.memo || null,
                  account_number: ext.accountNumber?.value || ext.accountNumber || null,
                  routing_number: ext.routingNumber?.value || ext.routingNumber || null,
                  image_url: c.image_url || null,
                  status: c.status || 'pending_review',
                  source_file: job.pdf_name,
                  page_number: c.page_number || null,
                });
              }
            }
            log('GET_CHECKS result', { count: checks.length });
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
          const hist = await supabaseRequest(
            `checks?tenant_id=eq.${tenantId}&status=eq.approved&select=id,job_id,check_number,amount,payee,check_date,status,source_file&order=updated_at.desc&limit=50`
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
              `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent("SELECT * FROM Account WHERE AccountType = 'Bank'")}&minorversion=65`,
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
          if (!s) return { txns: [] };
          // qb_entries is where /api/qbo/pull-checks stores data (the 561 records shown in the web app).
          // qb_transactions is a separate extension-only store — use qb_entries as primary source.
          const entries = await supabaseRequest(
            `qb_entries?select=id,check_number,date,amount,payee,account,memo,qb_source,qb_type&order=date.desc&limit=1000`
          ).catch(() => []);
          // Normalise to a common shape used by renderQBList
          const txns = (entries || []).map(e => ({
            id: e.id,
            txn_id: e.check_number || e.id,
            txn_type: e.qb_type || e.qb_source || 'Entry',
            qb_source: e.qb_source || null,
            txn_date: e.date,
            payee: e.payee,
            amount: e.amount,
            memo: e.memo,
            doc_number: e.check_number,
            account: e.account,
          }));
          log('GET_QB_TXNS result', { count: txns.length });
          return { txns };
        }
        case 'SAVE_QB_TXN': {
          log('SAVE_QB_TXN', { txnId: msg.txnId, txnType: msg.txnType, fields: msg.fields });
          const s = await getSession();
          if (!s?.access_token) return { error: 'Not logged in' };
          try {
            const tenantId = await getTenantId(s.user.id).catch(() => null);
            if (!tenantId) return { error: 'No tenant_id' };

            // 1. Update local Supabase cache
            await supabaseRequest(
              `qb_transactions?id=eq.${encodeURIComponent(msg.txnId)}&tenant_id=eq.${tenantId}`,
              { method: 'PATCH', body: JSON.stringify({ ...msg.fields, synced_at: new Date().toISOString() }) }
            );

            // 2. Also push edits to QuickBooks if we have type + Intuit ID
            const txnType = msg.txnType;
            const qbIntuitId = msg.qbIntuitId; // caller must pass the raw Intuit Id
            if (txnType && qbIntuitId) {
              try {
                const readData = await qbApiRequest(`${txnType.toLowerCase()}/${qbIntuitId}?minorversion=65`);
                const entity = readData[txnType] || readData[Object.keys(readData)[0]];
                if (entity) {
                  const updates = {};
                  if (msg.fields.txn_date) updates.TxnDate = msg.fields.txn_date;
                  if (msg.fields.amount != null) updates.TotalAmt = msg.fields.amount;
                  if (msg.fields.payee) updates.PrivateNote = `[Kyriq edit] Payee: ${msg.fields.payee}\n${entity.PrivateNote || ''}`.trim();
                  if (msg.fields.doc_number) updates.DocNumber = msg.fields.doc_number;
                  if (Object.keys(updates).length > 0) {
                    await qbApiRequest(`${txnType.toLowerCase()}?minorversion=65`, 'POST', { ...entity, ...updates });
                    log('SAVE_QB_TXN: QB entity updated', { txnType, qbIntuitId });
                  }
                }
              } catch (qbErr) {
                logErr('SAVE_QB_TXN: QB update failed (Supabase still saved)', qbErr);
                return { success: true, qbWarning: qbErr.message };
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
          const backendUrl = bootstrap.backendUrl?.replace(/\/$/, '') || '';
          try {
            if (backendUrl && msg.jobId) {
              const res = await fetch(`${backendUrl}/api/jobs/${msg.jobId}/checks/${msg.checkId}/fields`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
                body: JSON.stringify(msg.fields),
              });
              if (res.ok) return { success: true };
            }
            // Fallback: direct Supabase PATCH on checks table
            const tenantId = await getTenantId(s.user.id).catch(() => null);
            if (tenantId) {
              await supabaseRequest(
                `checks?id=eq.${encodeURIComponent(msg.checkId)}&tenant_id=eq.${tenantId}`,
                { method: 'PATCH', body: JSON.stringify({ ...msg.fields, updated_at: new Date().toISOString() }) }
              );
              return { success: true };
            }
            return { error: 'Could not update: no tenant_id' };
          } catch (e) {
            logErr('UPDATE_CHECK_FIELDS failed', e);
            return { error: e.message };
          }
        }
        case 'UPDATE_CHECK_STATUS': {
          // Updates a check's status (approve/reject) via the Python backend job endpoint
          // Falls back to direct Supabase PATCH if backend not available
          log('UPDATE_CHECK_STATUS', { checkId: msg.checkId, status: msg.status });
          const s = await getSession();
          if (!s?.access_token) return { error: 'Not logged in' };
          const bootstrap = getBootstrapConfig();
          const backendUrl = bootstrap.backendUrl?.replace(/\/$/, '') || '';
          try {
            // Try backend first (sets status on check record)
            if (backendUrl && msg.jobId) {
              const res = await fetch(`${backendUrl}/api/jobs/${msg.jobId}/checks/${msg.checkId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
                body: JSON.stringify({ status: msg.status }),
              });
              if (res.ok) return { success: true };
            }
            // Fallback: direct Supabase PATCH on checks table
            const tenantId = await getTenantId(s.user.id).catch(() => null);
            if (tenantId) {
              await supabaseRequest(
                `checks?id=eq.${encodeURIComponent(msg.checkId)}&tenant_id=eq.${tenantId}`,
                { method: 'PATCH', body: JSON.stringify({ status: msg.status, updated_at: new Date().toISOString() }) }
              );
              return { success: true };
            }
            return { error: 'Could not update: no tenant_id' };
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
            const txns = await pullQBTransactions();
            log('PULL_QB_TXNS done', { count: txns.length });
            return { success: true, count: txns.length };
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
          log('RUN_MATCHING', { checksCount: msg.checks?.length });
          const matches = await runFullMatch(msg.checks);
          log('RUN_MATCHING done', { matchCount: matches?.length });
          // #region agent log
          const withQb = (matches || []).filter((m) => m.qbTxn).length;
          debugAgentLog({
            hypothesisId: 'H3',
            location: 'service-worker.js:RUN_MATCHING',
            message: 'match result summary',
            data: {
              checks: msg.checks?.length ?? 0,
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

          // Extract the Intuit entity ID from txn_id (format: "purchase-123", "billpayment-456")
          // txn_id is always stored as `${type.toLowerCase()}-${intuitId}`
          const txnType = qbTxn.txn_type;
          let qbIntuitId = null;
          if (qbTxn.txn_id) {
            const parts = String(qbTxn.txn_id).split('-');
            // Everything after the first segment is the Intuit ID (may contain dashes)
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
            return { success: true, cleared: false, warning: 'QB transaction not linked — approved in Kyriq only' };
          }

          // Save approval status to Supabase regardless of QB clear outcome
          const saveCheckApproval = async (checkId, jobId) => {
            if (!checkId) return;
            const s2 = await getSession();
            if (!s2?.access_token) return;
            const tenantId = await getTenantId(s2.user.id).catch(() => null);
            if (!tenantId) return;
            try {
              await supabaseRequest(
                `checks?id=eq.${encodeURIComponent(checkId)}&tenant_id=eq.${tenantId}`,
                { method: 'PATCH', body: JSON.stringify({ status: 'approved', updated_at: new Date().toISOString() }) }
              );
            } catch (dbErr) {
              logErr('APPROVE_AND_CLEAR: DB status save failed (non-critical)', dbErr);
            }
          };

          try {
            await clearQBTransaction(txnType, qbIntuitId);
            log(`APPROVE_AND_CLEAR: cleared ${txnType} #${qbIntuitId} in QB`);
            // #region agent log
            debugAgentLog({
              hypothesisId: 'H4',
              location: 'service-worker.js:APPROVE_AND_CLEAR',
              message: 'qb clear ok',
              data: { txnType, intuitIdLen: String(qbIntuitId).length },
            });
            // #endregion
            await saveCheckApproval(msg.checkId, msg.jobId);
            return { success: true, cleared: true };
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
            // Local-only approve: record status in DB but warn user that QB was not cleared
            await saveCheckApproval(msg.checkId, msg.jobId);
            return { success: true, cleared: false, warning: `QB not cleared: ${e.message}` };
          }
        }
        case 'SEARCH_QB': {
          const { tenantId: tid2, realmId: rid } = await getActiveConnection();
          const results = await supabaseRequest(
            `qb_transactions?tenant_id=eq.${tid2}&realm_id=eq.${rid}&or=(payee.ilike.%25${msg.query}%25,doc_number.ilike.%25${msg.query}%25)&order=txn_date.desc&limit=20`
          );
          return { results: results || [] };
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
