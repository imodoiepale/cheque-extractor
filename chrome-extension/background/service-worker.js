/**
 * Kyriq — Background Service Worker
 * Handles: Supabase auth, QB API calls, token refresh, matching, clearing transactions
 */

// ── Config (loaded from chrome.storage) ──────────────────────
const DEFAULTS = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  qbClientId: '',
  qbClientSecret: '',
  geminiApiKey: '',
};

async function getConfig() {
  const { config } = await chrome.storage.local.get('config');
  return { ...DEFAULTS, ...config };
}

async function getSession() {
  const { session } = await chrome.storage.local.get('session');
  return session || null;
}

async function saveSession(session) {
  await chrome.storage.local.set({ session });
}

// ── Supabase helpers ─────────────────────────────────────────
async function supabaseRequest(path, options = {}) {
  const cfg = await getConfig();
  if (!cfg.supabaseUrl) throw new Error('Supabase URL not configured');
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
  const cfg = await getConfig();
  const res = await fetch(`${cfg.supabaseUrl}/auth/v1/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.supabaseAnonKey },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Auth failed');
  return data;
}

// ── QB API helpers ───────────────────────────────────────────
async function getActiveConnection() {
  const session = await getSession();
  if (!session) throw new Error('Not logged in');

  const profiles = await supabaseRequest(
    `user_profiles?id=eq.${session.user.id}&select=tenant_id`,
    { method: 'GET' }
  );
  if (!profiles?.length) throw new Error('No profile found');
  const tenantId = profiles[0].tenant_id;

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

  // Refresh token
  const cfg = await getConfig();
  const clientId = cfg.qbClientId;
  const clientSecret = cfg.qbClientSecret;
  if (!clientId || !clientSecret) throw new Error('QB credentials not configured');

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: conn.refresh_token }),
  });

  if (!res.ok) throw new Error('Token refresh failed');
  const newTokens = await res.json();

  // Save refreshed tokens
  await supabaseRequest(
    `qb_connections?id=eq.${conn.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        access_token: newTokens.access_token,
        refresh_token: newTokens.refresh_token,
        token_expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
      }),
    }
  );

  return { token: newTokens.access_token, realmId: conn.realm_id, tenantId: conn.tenantId, connId: conn.id };
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

  // Date (15pts)
  if (check.check_date && qbTxn.txn_date) {
    const days = Math.abs(new Date(check.check_date) - new Date(qbTxn.txn_date)) / 86400000;
    if (days === 0) reasons.date = 15;
    else if (days <= 1) reasons.date = 12;
    else if (days <= 3) reasons.date = 8;
    else if (days <= 7) reasons.date = 4;
    else if (days <= 14) reasons.date = 1;
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
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

  const queries = [
    { q: `SELECT * FROM Purchase WHERE PaymentType = 'Check' AND TxnDate >= '${thirtyDaysAgo}'`, key: 'Purchase', type: 'Purchase' },
    { q: `SELECT * FROM BillPayment WHERE TxnDate >= '${thirtyDaysAgo}'`, key: 'BillPayment', type: 'BillPayment' },
    { q: `SELECT * FROM Check WHERE TxnDate >= '${thirtyDaysAgo}'`, key: 'Check', type: 'Check' },
  ];

  // Fetch all transaction types in parallel for 3x faster sync
  const allTxns = [];
  const fetchPromises = queries.map(async ({ q, key, type }) => {
    try {
      const res = await fetch(
        `https://quickbooks.api.intuit.com/v3/company/${realmId}/query?query=${encodeURIComponent(q)}&minorversion=65`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (res.ok) {
        const data = await res.json();
        const txns = data?.QueryResponse?.[key] || [];
        return txns.map(t => ({
          tenant_id: tenantId,
          realm_id: realmId,
          txn_id: `${type.toLowerCase()}-${t.Id}`,
          txn_type: type,
          txn_date: t.TxnDate,
          payee: t.EntityRef?.name || t.VendorRef?.name || t.CustomerRef?.name || null,
          amount: t.TotalAmt,
          memo: t.PrivateNote || null,
          doc_number: t.DocNumber || null,
          account: t.AccountRef?.name || t.BankAccountRef?.name || null,
          qb_id: t.Id,
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

  // Upsert to Supabase
  if (allTxns.length > 0) {
    const session = await getSession();
    allTxns.forEach(t => { t.user_id = session.user.id; });
    await supabaseRequest('qb_transactions', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(allTxns),
    });
  }

  return allTxns;
}

// ── Run full matching ────────────────────────────────────────
async function runFullMatch(extractedChecks) {
  const { tenantId, realmId } = await getActiveConnection();
  const session = await getSession();

  // Get QB transactions from Supabase
  const qbTxns = await supabaseRequest(
    `qb_transactions?tenant_id=eq.${tenantId}&realm_id=eq.${realmId}&order=txn_date.desc&limit=500`,
    { method: 'GET' }
  );

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
        case 'LOGIN': {
          const data = await supabaseAuth('token?grant_type=password', {
            email: msg.email, password: msg.password,
          });
          await saveSession(data);
          return { success: true, user: data.user };
        }
        case 'LOGOUT': {
          await chrome.storage.local.remove('session');
          return { success: true };
        }
        case 'GET_SESSION': {
          const s = await getSession();
          return { session: s };
        }
        case 'GET_CONFIG': {
          return await getConfig();
        }
        case 'SAVE_CONFIG': {
          await chrome.storage.local.set({ config: msg.config });
          return { success: true };
        }
        case 'GET_CONNECTIONS': {
          const s = await getSession();
          if (!s) return { connections: [] };
          const profiles = await supabaseRequest(`user_profiles?id=eq.${s.user.id}&select=tenant_id`);
          if (!profiles?.length) return { connections: [] };
          const conns = await supabaseRequest(
            `qb_connections?tenant_id=eq.${profiles[0].tenant_id}&select=id,realm_id,company_name,is_active,connected_at&order=connected_at.asc`
          );
          return { connections: conns || [] };
        }
        case 'SWITCH_COMPANY': {
          const s = await getSession();
          const profiles = await supabaseRequest(`user_profiles?id=eq.${s.user.id}&select=tenant_id`);
          const tid = profiles[0].tenant_id;
          // Deactivate all
          await supabaseRequest(`qb_connections?tenant_id=eq.${tid}`, {
            method: 'PATCH', body: JSON.stringify({ is_active: false }),
          });
          // Activate requested
          await supabaseRequest(`qb_connections?tenant_id=eq.${tid}&realm_id=eq.${msg.realmId}`, {
            method: 'PATCH', body: JSON.stringify({ is_active: true }),
          });
          return { success: true };
        }
        case 'PULL_QB_TXNS': {
          const txns = await pullQBTransactions();
          return { success: true, count: txns.length };
        }
        case 'EXTRACT_CHECK': {
          const result = await extractCheckData(msg.imageBase64, msg.mimeType);
          return { success: true, data: result };
        }
        case 'RUN_MATCHING': {
          const matches = await runFullMatch(msg.checks);
          return { success: true, matches };
        }
        case 'APPROVE_AND_CLEAR': {
          // Approve the match and clear in QB
          const { qbTxn } = msg;
          if (qbTxn?.qb_id && qbTxn?.txn_type) {
            await clearQBTransaction(qbTxn.txn_type, qbTxn.qb_id);
          }
          return { success: true, cleared: true };
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
      console.error('Background error:', err);
      return { error: err.message };
    }
  };

  handler().then(sendResponse);
  return true; // keep message channel open for async
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
      `matches?tenant_id=eq.${tenantId}&status=in.(pending,unmatched,discrepancy)&select=id`,
      { method: 'GET', headers: { Prefer: 'count=exact' } }
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
});
