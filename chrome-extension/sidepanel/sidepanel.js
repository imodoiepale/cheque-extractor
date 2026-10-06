/**
 * Kyriq — Side Panel Controller
 * Auth, QB connect, 3-step upload, matches, documents, history
 */

// ── Helpers ───────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function show(sel) {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (el) el.style.display = '';
}
function hide(sel) {
  const el = typeof sel === 'string' ? $(sel) : sel;
  if (el) el.style.display = 'none';
}
function showLoading(text = 'Loading...') {
  $('#loading-text').textContent = text;
  show('#loading');
}
function hideLoading() { hide('#loading'); }

function fmt(amount) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
async function runWithLimit(items, limit, worker) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await worker(items[idx], idx); }
      catch (e) { out[idx] = { error: e }; }
    }
  });
  await Promise.all(workers);
  return out;
}

function parseCheckDate(d) {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d;
  const s = String(d).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T12:00:00');
  // MM/DD/YYYY or M/D/YYYY — only when first part is a valid month (≤12)
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy && +mdy[1] <= 12) return new Date(+mdy[3], +mdy[1] - 1, +mdy[2], 12);
  // DD/MM/YYYY — first part > 12 means it must be a day
  if (mdy && +mdy[1] > 12) return new Date(+mdy[3], +mdy[2] - 1, +mdy[1], 12);
  // MM-DD-YYYY
  const mdyd = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (mdyd) return new Date(+mdyd[3], +mdyd[1] - 1, +mdyd[2], 12);
  // YYYY/MM/DD
  const ymd2 = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (ymd2) return new Date(+ymd2[1], +ymd2[2] - 1, +ymd2[3], 12);
  // Month DD YYYY ("Jan 26 2026")
  const native = new Date(s);
  return isNaN(native.getTime()) ? null : native;
}

// Parse a date string entered by the user, respecting the active _dateFormat.
// When format is dd/mm/yyyy, treat D/M/Y slashed pairs as day-first.
function parseDateInput(s) {
  if (!s) return null;
  if (_dateFormat === 'dd/mm/yyyy' || _dateFormat === 'dd mmm yyyy') {
    const dmy = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmy) return new Date(+dmy[3], +dmy[2] - 1, +dmy[1], 12);
  }
  return parseCheckDate(s);
}

// Convert any date string to YYYY-MM-DD (what QB API and Supabase expect).
function toISODate(s) {
  const dt = parseDateInput(s);
  if (!dt || isNaN(dt.getTime())) return null;
  const MM = String(dt.getMonth() + 1).padStart(2, '0');
  const DD = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${MM}-${DD}`;
}
// ── Date format (loaded from chrome.storage.local) ──
let _dateFormat = 'dd/mm/yyyy'; // default: dd/mm/yyyy

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(d) {
  const dt = parseCheckDate(d);
  if (!dt) return d || '—';
  const DD  = String(dt.getDate()).padStart(2, '0');
  const MM  = String(dt.getMonth() + 1).padStart(2, '0');
  const YYYY = dt.getFullYear();
  const MMM = MONTHS_SHORT[dt.getMonth()];
  switch (_dateFormat) {
    case 'mm/dd/yyyy': return `${MM}/${DD}/${YYYY}`;
    case 'yyyy-mm-dd': return `${YYYY}-${MM}-${DD}`;
    case 'dd mmm yyyy': return `${DD} ${MMM} ${YYYY}`;
    case 'mmm dd yyyy': return `${MMM} ${DD} ${YYYY}`;
    default:           return `${DD}/${MM}/${YYYY}`; // dd/mm/yyyy
  }
}

function getQBSource(txn) {
  if (!txn) return '';
  if (txn.qb_source) return txn.qb_source;
  switch (txn.txn_type) {
    case 'Purchase':    return 'cheque_written';
    case 'BillPayment': return 'bill_paid_by_cheque';
    case 'Check':       return 'payroll_check';
    case 'Payment':     return 'cheque_received';
    default:            return '';
  }
}

async function loadDateFormat() {
  try {
    const { dateFormat } = await chrome.storage.local.get('dateFormat');
    if (dateFormat) _dateFormat = dateFormat;
  } catch (_) {}
  const sel = $('#date-format-select');
  if (sel) sel.value = _dateFormat;
}

async function saveDateFormat(fmt) {
  _dateFormat = fmt;
  await chrome.storage.local.set({ dateFormat: fmt }).catch(() => {});
  // Re-render all visible date displays
  if (_cachedQB !== null) renderQBList(_cachedQB);
  if (matches.length) renderMatches();
  if (_cachedChecks !== null) renderChecksList(_cachedChecks);
  if (_cachedDocs !== null) renderDocumentsList(_cachedDocs);
  if (_cachedHistory !== null) renderHistoryList(_cachedHistory);
}

// ── Overlay visibility setting (mirrors chrome.storage.local.kyriqOverlayMode) ──
// Valid values: 'whenOpen' (default) | 'always' | 'never'
async function loadOverlayModeSetting() {
  try {
    const { kyriqOverlayMode } = await chrome.storage.local.get('kyriqOverlayMode');
    const mode = kyriqOverlayMode || 'whenOpen';
    document.querySelectorAll('input[name="overlay-mode"]').forEach(r => {
      r.checked = (r.value === mode);
    });
  } catch (_) {}
}

async function saveOverlayModeSetting(mode) {
  if (!['whenOpen', 'always', 'never'].includes(mode)) return;
  await chrome.storage.local.set({ kyriqOverlayMode: mode }).catch(() => {});
  dbg(`Overlay visibility set to: ${mode}`, 'info');
}
function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
function fmtTs() {
  return new Date().toISOString().slice(11, 19);
}
function sendMsg(msg, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (val) => {
      if (settled) return;
      settled = true;
      resolve(val ?? null);
    };
    const timer = setTimeout(() => {
      dbg(`SW timeout [${msg?.type}] after ${timeoutMs}ms`, 'error');
      settle(null);
    }, timeoutMs);
    try {
      chrome.runtime.sendMessage(msg, (res) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          dbg(`SW error [${msg?.type}]: ${chrome.runtime.lastError.message}`, 'error');
          settle(null);
          return;
        }
        settle(res);
      });
    } catch (e) {
      clearTimeout(timer);
      dbg(`SW sendMessage threw [${msg?.type}]: ${e?.message}`, 'error');
      settle(null);
    }
  });
}
function scoreClass(s) {
  if (s >= 90) return 'score-high';
  if (s >= 60) return 'score-mid';
  if (s > 0) return 'score-low';
  return 'score-none';
}
function barColor(pct) {
  if (pct >= 80) return 'green';
  if (pct >= 50) return 'amber';
  return 'red';
}

// ── Debug logging ─────────────────────────────────────────────
function dbg(msg, type = 'info') {
  const ts = fmtTs();
  console.log(`[Kyriq UI ${ts}] ${msg}`);
  const log = $('#debug-log');
  if (!log) return;
  const line = document.createElement('div');
  line.className = `debug-line ${type}`;
  line.innerHTML = `<span class="ts">${ts}</span>${escHtml(msg)}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

// Show the debug panel — used during approval flows so the user sees
// real-time feedback from the QB content script.
function ensureDebugPanelOpen() {
  const panel = $('#debug-panel');
  if (panel && panel.style.display === 'none') panel.style.display = '';
}
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Upload progress log ───────────────────────────────────────
function appendLog(msg, type = '') {
  const log = $('#progress-log');
  if (!log) return;
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.innerHTML = `<span class="log-ts">${fmtTs()}</span>${escHtml(msg)}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
  dbg(msg);
}
function clearProgressLog() {
  const log = $('#progress-log');
  if (log) log.innerHTML = '';
}

// ── State ─────────────────────────────────────────────────────
let currentView = 'auth';
let currentTab = 'matches';
let currentFilter = 'all';
let matches = [];
let pendingFiles = [];
let extractedChecks = [];
let connections = [];
let session = null;
let selectedMethod = 'hybrid';
let currentJobId = null;
let _pollTimer = null;
// ── State cache (avoid redundant fetches on tab navigation) ──
let _cachedDocs = null;    // null = not loaded yet; [] = loaded but empty
let _cachedChecks = null;
let _cachedHistory = null;
let _reviewCheck = null;  // check currently open in review modal
let _reviewMatch = null;  // match object (with qbTxn) for current review modal
// ── Checks filter state ──
let _checksSearch = '';
let _checksDateFrom = null;
let _checksDateTo = null;
// ── Matches filter state ──
// Needs Attention chip currently selected: '' | 'lowconf' | 'duplicate'
// | 'discrepancy' | 'unmatched'. Independent of currentFilter so a chip and a
// status pill cannot silently contradict each other.
let _attentionFilter = '';
// The Approve tab is the Match view narrowed to rows that actually have an
// Approve action. Not a separate data set, so not a separate view.
let _approveMode = false;
// Anything below this score is "lower confidence". Same threshold the bulk
// approve button uses, so one number governs both.
const CONFIDENCE_FLOOR = 95;

let _matchSearch = '';
let _matchDateFrom = null;
let _matchDateTo = null;
// ── Matches sort state ──
let _sortField = 'date';     // 'date' | 'amount' | 'checknum' | 'score'
let _sortDir   = 'desc';    // 'asc' | 'desc'
// ── QB transactions filter state ──
let _qbSearch       = '';
let _qbDateFrom     = null;
let _qbDateTo       = null;
let _qbSourceFilter = '';  // qb_source value to filter QB Data tab ('' = all)
let _cachedQB       = null; // null = not loaded yet; [] = loaded but empty
// ── Single-flight guards (prevent duplicate concurrent loads) ──
let _inflightChecksMatch = null;
let _inflightQB          = null;
let _inflightDocs        = null;
let _inflightChecks      = null;
let _loginInProgress     = false;
// ── Document / account / source filter state ──
let _docFilter        = ''; // job_id to filter matches by ('' = all)
let _chequeDocFilter  = ''; // job_id to filter cheques by ('' = all)
let _accountFilter    = ''; // account name to filter matches + QB txns ('' = all)
let _matchSourceFilter = ''; // qb_source filter on Matches tab ('' = all)

// ── QB endpoint-missing banner (kyriq.com not yet deployed) ─
function showQBEndpointMissingBanner(msg) {
  const banner = $('#match-banner');
  if (!banner) return;
  banner.innerHTML = `
    <span>${escHtml(msg || 'Token refresh endpoint not found — please deploy the latest frontend build.')}</span>
    <a id="btn-qb-deploy-link" href="https://kyriq.com/settings" target="_blank" class="btn-sm btn-qb" style="margin-left:8px;padding:3px 10px;font-size:11px;">Open Web App</a>`;
  banner.style.display = '';
  banner.className = 'match-banner banner-warn';
}

// ── QB reconnect banner ───────────────────────────────────────
function showQBReconnectBanner(msg) {
  setQbStatus('stale');
  const banner = $('#match-banner');
  if (!banner) return;
  banner.innerHTML = `
    <span>${escHtml(msg || 'QuickBooks authorization expired.')}</span>
    <button id="btn-qb-reconnect-banner" class="btn-sm btn-qb" style="margin-left:8px;padding:3px 10px;font-size:11px;">Reconnect QB</button>`;
  banner.style.display = '';
  banner.className = 'match-banner banner-warn';
  $('#btn-qb-reconnect-banner')?.addEventListener('click', async () => {
    banner.style.display = 'none';
    const res = await sendMsg({ type: 'OPEN_QB_AUTH' });
    if (res?.success) {
      dbg('QB re-auth tab opened — authorize and return here', 'info');
    } else {
      dbg(`QB re-auth failed: ${res?.error}`, 'error');
    }
  });
}

// ── Centralised client-side state reset (called on logout / tenant switch) ──
function resetClientState() {
  _cachedQB = null;
  _cachedDocs = null;
  _cachedChecks = null;
  _cachedHistory = null;
  extractedChecks = [];
  matches = [];
  connections = [];
  _accountFilter = '';
  _matchSourceFilter = '';
  _docFilter = '';
  _chequeDocFilter = '';
  _qbSearch = '';
  _qbDateFrom = null;
  _qbDateTo = null;
  _qbSourceFilter = '';
  // Reset single-flight guards (shouldn't be resolved but be safe)
  _inflightChecksMatch = _inflightQB = _inflightDocs = _inflightChecks = null;
  _loginInProgress = false;
  // Clear rendered lists so no stale data lingers visually
  const listSelectors = ['#qb-list', '#documents-list', '#checks-list', '#history-list', '#matches-list'];
  listSelectors.forEach(sel => { const el = $(sel); if (el) el.innerHTML = ''; });
}

// ── Runtime message listener (single dispatcher) ─────────────
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'SESSION_CHANGED': {
      dbg(`Session ${msg.signedIn ? 'established' : 'cleared'}`, 'info');
      if (msg.signedIn) {
        // Only invalidate the QB cache so the QB tab refreshes with the
        // tenant-correct data (avoid nuking in-progress login flows).
        _cachedQB = null;
        if (typeof currentTab !== 'undefined' && currentTab === 'qb') {
          loadQBTransactions(true).catch(() => {});
        }
      } else {
        resetClientState();
      }
      return;
    }

    case 'CHECK_UPDATED': {
      if (!msg.checkId) return;
      const m = matches.find(x =>
        x.check?.id === msg.checkId || x.check?.check_id === msg.checkId
      );
      if (m && m.status !== (msg.status || 'approved')) {
        m.status = msg.status || 'approved';
        renderMatches();
        if (msg.cleared) {
          dbg('Approved & cleared in QB ✓', 'success');
        } else if (msg.qbStatus === 'queued_for_reconcile') {
          dbg('Approved — queued for QB Reconcile', 'success');
        } else {
          dbg('Approved locally (QB sync pending)', 'warn');
        }
      }
      return;
    }

    case 'QB_OAUTH_COMPLETE': {
      handleQBOAuthComplete(msg);
      return;
    }

    // Logs forwarded from the QB content script so the user can see what's
    // happening on the page (e.g. row matching, click results) in the
    // sidepanel debug panel.
    case 'KYRIQ_CONTENT_LOG': {
      ensureDebugPanelOpen();
      const prefix = msg.page ? `[${msg.page}] ` : '[QB] ';
      dbg(prefix + (msg.msg || ''), msg.level || 'info');
      return;
    }
  }
});

async function handleQBOAuthComplete(msg) {
  dbg(`QB OAuth completed${msg.company ? ' for ' + msg.company : ''} — auto-refreshing connections`, 'success');
  const infoEl = $('#qb-connect-info');
  if (infoEl) {
    infoEl.textContent = `✅ Connected${msg.company ? ' to ' + msg.company : ''}! Loading your workspace…`;
    infoEl.style.display = '';
  }
  try {
    showLoading('Connecting QuickBooks...');
    const res = await sendMsg({ type: 'GET_CONNECTIONS' });
    connections = res?.connections || [];
    if (connections.length === 0) {
      hideLoading();
      dbg('QB_OAUTH_COMPLETE: no connections found yet — user may need to click refresh', 'warn');
      return;
    }
    renderCompanySelect();
    showView('main');
    showLoading('Syncing QuickBooks transactions...');
    const pullRes = await sendMsg({ type: 'PULL_QB_TXNS' }).catch(() => ({}));
    hideLoading();
    if (pullRes?.endpointMissing) {
      switchTab('matches');
      showQBEndpointMissingBanner(pullRes.error);
      dbg('QB refresh endpoint missing — frontend deploy needed', 'error');
      return;
    }
    if (pullRes?.reconnectNeeded) {
      switchTab('matches');
      showQBReconnectBanner(pullRes.error);
      dbg('QB token expired on OAuth complete — reconnect required', 'error');
      return;
    }
    await loadChecksIntoMatches();
    dbg('QB auto-connect flow complete', 'success');
  } catch (e) {
    hideLoading();
    dbg(`QB_OAUTH_COMPLETE handler error: ${e?.message || e}`, 'error');
  }
}

// ── Sidepanel-open liveness port (lets content scripts know when to show overlay) ──
let _sidepanelPort = null;
function openSidepanelPort() {
  try {
    _sidepanelPort = chrome.runtime.connect({ name: 'kyriq-sidepanel' });
    _sidepanelPort.onDisconnect.addListener(() => { _sidepanelPort = null; });
  } catch (e) {
    // Service worker not ready yet — retry once.
    setTimeout(() => {
      try { _sidepanelPort = chrome.runtime.connect({ name: 'kyriq-sidepanel' }); } catch {}
    }, 200);
  }
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  dbg('Kyriq side panel init');
  let res = null;
  // Retry session fetch — SW may still be warming up
  for (let t = 0; t < 3 && !res; t++) {
    res = await sendMsg({ type: 'GET_SESSION' });
    if (!res && t < 2) await new Promise(r => setTimeout(r, 500 * (t + 1)));
  }
  session = res?.session;
  dbg(`Session: ${session ? session.user?.email : 'none'}`);
  if (session) {
    setUserChip(session.user?.email, session.user);
    await postLoginFlow();
  } else {
    hide('#btn-profile'); hide('#profile-panel'); hide('#btn-logout');
    showView('auth');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  openSidepanelPort();
  bindEvents();
  loadDateFormat();
  loadOverlayModeSetting();
  init();
  // Approve confirmation dialog bindings
  $('#approve-confirm-cancel')?.addEventListener('click', hideApproveConfirm);
  $('#approve-confirm-overlay')?.addEventListener('click', e => {
    if (e.target === $('#approve-confirm-overlay')) hideApproveConfirm();
  });

  // Error dialog bindings
  $('#error-dialog-close')?.addEventListener('click',  hideErrorDialog);
  $('#error-dialog-close2')?.addEventListener('click', hideErrorDialog);
  $('#error-dialog-overlay')?.addEventListener('click', e => {
    if (e.target === $('#error-dialog-overlay')) hideErrorDialog();
  });
  $('#error-dialog-copy')?.addEventListener('click', () => {
    const title = $('#error-dialog-title')?.textContent || '';
    const msg   = $('#error-dialog-msg')?.textContent   || '';
    const raw   = $('#error-dialog-raw')?.textContent   || '';
    const parts = [`[Kyriq Error] ${title}`, msg, raw ? `--- Raw QB Response ---\n${raw}` : ''].filter(Boolean);
    navigator.clipboard.writeText(parts.join('\n\n')).then(() => {
      const btn = $('#error-dialog-copy');
      if (btn) { btn.textContent = '✓ Copied!'; setTimeout(() => { btn.textContent = '📋 Copy'; }, 2000); }
    }).catch(() => {});
  });
  $('#approve-confirm-ok')?.addEventListener('click', async () => {
    const idx = _pendingApproveIdx;
    const bulkCb = _pendingBulkCb;
    hideApproveConfirm();
    if (bulkCb) await bulkCb();
    else if (idx !== null) await approveAndClear(idx);
  });

  // NOTE: CHECK_UPDATED handling moved to the single top-level
  // chrome.runtime.onMessage dispatcher above — avoids duplicate listeners.
});

// ── View management ───────────────────────────────────────────
function showView(view) {
  currentView = view;
  const allViews = ['#view-auth', '#view-qb-connect', '#view-matches', '#view-upload', '#view-documents', '#view-cheques', '#view-qb', '#view-history'];
  allViews.forEach(v => { const el = $(v); if (el) el.style.display = 'none'; });

  if (view === 'auth') {
    show('#view-auth');
    hide('#company-bar');
    hide('#tabs');
  } else if (view === 'qb-connect') {
    show('#view-qb-connect');
    hide('#company-bar');
    hide('#tabs');
  } else if (view === 'main') {
    show('#company-bar');
    show('#tabs');
    switchTab(currentTab);
  }
  dbg(`View → ${view}`, 'info');
}

function switchTab(tab) {
  currentTab = tab;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  if (tab !== 'matches' && tab !== 'approve') _approveMode = false;
  ['#view-matches', '#view-upload', '#view-documents', '#view-cheques', '#view-qb', '#view-history'].forEach(v => {
    const el = $(v); if (el) el.style.display = 'none';
  });

  if (tab === 'matches' || tab === 'approve') {
    // Approve reuses the Match view: same rows, narrowed to the approvable ones.
    _approveMode = (tab === 'approve');
    show('#view-matches');
    if (!extractedChecks.length) loadChecksIntoMatches();
    else renderMatches();
  }
  else if (tab === 'upload')    { show('#view-upload'); }
  else if (tab === 'documents') { show('#view-documents'); loadDocuments(); }
  else if (tab === 'cheques')   { show('#view-cheques'); loadChecks(); }
  else if (tab === 'qb')        { show('#view-qb'); loadQBTransactions(); }
  else if (tab === 'history')   { show('#view-history'); loadHistory(); }
}

function setUserChip(email, user) {
  if (!email) return;
  const btn = $('#btn-profile');
  const chipText = $('#user-chip-text');
  if (chipText) chipText.textContent = email.split('@')[0];
  if (btn) show(btn);
  // Populate profile panel
  const initials = email.split('@')[0].slice(0, 2).toUpperCase();
  const avatar = $('#profile-avatar');
  const nameEl = $('#profile-name');
  const emailEl = $('#profile-email');
  if (avatar) avatar.textContent = initials;
  if (nameEl) nameEl.textContent = user?.user_metadata?.full_name || user?.user_metadata?.name || email.split('@')[0];
  if (emailEl) emailEl.textContent = email;
}

// ── Post-login: check QB connections ─────────────────────────
async function postLoginFlow() {
  if (_loginInProgress) { dbg('postLoginFlow: already in progress — skipping'); return; }
  _loginInProgress = true;
  showLoading('Loading workspace...');
  dbg('postLoginFlow: fetching connections');
  try {
    const res = await sendMsg({ type: 'GET_CONNECTIONS' });
    connections = res?.connections || [];
    dbg(`Connections: ${connections.length}`);

    if (connections.length === 0) {
      hideLoading();
      showView('qb-connect');
    } else {
      // Check if any connection is active; if none, warn visibly
      const hasActive = connections.some(c => c.is_active);
      if (!hasActive) {
        dbg('No active QB connection — activating first available', 'warn');
        await sendMsg({ type: 'SWITCH_COMPANY', realmId: connections[0].realm_id });
        connections[0].is_active = true;
      }
      renderCompanySelect();
      showView('main');
      setQbStatus('connected');
      refreshUsageMeter();
      // Pull QB transactions first so matching has data, then load checks
      showLoading('Syncing QuickBooks transactions...');
      try {
        const pullRes = await sendMsg({ type: 'PULL_QB_TXNS' });
        if (pullRes?.endpointMissing) {
          hideLoading();
          switchTab('matches');
          showQBEndpointMissingBanner(pullRes.error);
          dbg('QB refresh endpoint missing — frontend deploy needed', 'error');
          return;
        }
        if (pullRes?.reconnectNeeded) {
          hideLoading();
          switchTab('matches');
          showQBReconnectBanner(pullRes.error);
          dbg('QB token expired on login — reconnect required', 'error');
          return;
        }
        _cachedQB = null; // Invalidate QB Data cache so tab shows fresh data
        dbg(`QB auto-sync: ${pullRes?.count || 0} transactions`);
        if (pullRes?.partialErrors?.length) {
          dbg(`QB auto-sync partial errors: ${pullRes.partialErrors.map(e => `${e.type}(${e.status})`).join(', ')}`, 'warn');
        }
      } catch (e) {
        dbg(`QB auto-sync failed (non-fatal): ${e.message}`, 'warn');
      }
      await loadChecksIntoMatches();
      // Pre-load docs for filter dropdown (non-blocking)
      sendMsg({ type: 'GET_DOCUMENTS' }).then(r => {
        if (r?.documents?.length) { _cachedDocs = r.documents; populateDocFilter(r.documents); }
      });
      // Pre-load account list for account selector
      populateAccountSelect();
      hideLoading();
    }
  } catch (e) {
    dbg(`postLoginFlow error: ${e.message}`, 'error');
    hideLoading();
    showView('main');
  } finally {
    _loginInProgress = false;
  }
}

// ── Load checks from DB → extractedChecks → run matching ──
// Single-flight guarded: concurrent callers share the same in-flight promise.
async function loadChecksIntoMatches() {
  if (_inflightChecksMatch) {
    dbg('loadChecksIntoMatches: reusing in-flight load');
    return _inflightChecksMatch;
  }
  _inflightChecksMatch = (async () => {
    dbg('loadChecksIntoMatches: fetching DB checks');
    updateMatchesBanner('loading');
    const res = await sendMsg({ type: 'GET_CHECKS' });
    const dbChecks = res?.checks || [];
    if (!dbChecks.length) {
      dbg('loadChecksIntoMatches: no checks in DB yet');
      updateMatchesBanner('empty');
      renderMatches();
      return;
    }
    extractedChecks = dbChecks;
    dbg(`loadChecksIntoMatches: ${extractedChecks.length} checks loaded`);
    updateMatchesBanner('loaded', extractedChecks.length);
    // Run matching algorithm
    showLoading(`Matching ${extractedChecks.length} cheques…`);
    const matchRes = await sendMsg({ type: 'RUN_MATCHING', checks: extractedChecks });
    hideLoading();
    if (matchRes?.matches) {
      matches = matchRes.matches;
      dbg(`Matching done: ${matches.length} results`, 'success');
      const matchAccounts = [...new Set(matches.filter(m => m.qbTxn?.account).map(m => m.qbTxn.account))].sort();
      if (matchAccounts.length > 0) {
        const sel = $('#account-select');
        if (sel) {
          const prev = sel.value;
          // Preserve any QB Account.Id values already loaded by populateAccountSelect()
          // so toast CTAs can build a real /reconcileAccount URL even after a re-match.
          const savedIds = {};
          [...sel.options].forEach(o => {
            if (o.dataset.accountName && o.dataset.accountId)
              savedIds[o.dataset.accountName] = o.dataset.accountId;
          });
          while (sel.options.length > 1) sel.remove(1);
          matchAccounts.forEach(a => {
            const opt = document.createElement('option');
            const knownId = savedIds[a] || '';
            opt.value = a;                  // always name — keeps _accountFilter working
            opt.dataset.accountId = knownId;
            opt.dataset.accountName = a;
            opt.textContent = a.slice(0, 28);
            sel.appendChild(opt);
          });
          if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
        }
        dbg(`Account select refreshed: ${matchAccounts.length} accounts`);
      }
    }
    renderMatches();
    await autoApproveCleared();
  })().finally(() => { _inflightChecksMatch = null; });
  return _inflightChecksMatch;
}

function updateMatchesBanner(state, count) {
  const banner = $('#match-banner');
  if (!banner) return;
  if (state === 'loading') {
    banner.textContent = 'Loading cheques from database…';
    banner.style.display = '';
  } else if (state === 'empty') {
    banner.style.display = 'none';
  } else if (state === 'loaded') {
    banner.textContent = `${count} cheques loaded from database`;
    banner.style.display = '';
  }
}

function renderCompanySelect() {
  const sel = $('#company-select');
  sel.innerHTML = '';
  connections.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.realm_id;
    opt.textContent = c.company_name || `Realm ${c.realm_id}`;
    opt.selected = c.is_active;
    sel.appendChild(opt);
  });
}

// ── Matches ───────────────────────────────────────────────────
function populateDocFilter(docs) {
  const selMatch = $('#doc-filter');
  const selCheques = $('#cheques-doc-filter');
  [selMatch, selCheques].forEach(sel => {
    if (!sel) return;
    const prev = sel.value;
    // Keep first option (All Uploads / All Docs)
    while (sel.options.length > 1) sel.remove(1);
    (docs || []).forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.job_id;
      opt.textContent = (d.pdf_name || d.job_id || 'Untitled').slice(0, 30);
      sel.appendChild(opt);
    });
    sel.value = prev || '';
  });
}

async function populateAccountSelect() {
  const sel = $('#account-select');
  if (!sel) return;
  const res = await sendMsg({ type: 'GET_QB_ACCOUNTS' });
  const accounts = res?.accounts || []; // [{id, name}]
  const prev = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  accounts.forEach(a => {
    const opt = document.createElement('option');
    // value = account NAME so _accountFilter === m.qbTxn.account comparisons keep working.
    // QB Account.Id lives in dataset.accountId for URL building only.
    opt.value = a.name;
    opt.dataset.accountId = a.id || '';
    opt.dataset.accountName = a.name;
    opt.textContent = (a.name || '').slice(0, 28);
    sel.appendChild(opt);
  });
  sel.value = prev || '';
  dbg(`Account select: ${accounts.length} accounts loaded`);
}

function getSelectedQbAccount() {
  const sel = document.getElementById('account-select');
  const opt = sel?.selectedOptions?.[0];
  return {
    id: opt?.dataset?.accountId || null,
    name: opt?.dataset?.accountName || sel?.value || '',
  };
}

/**
 * Flags for the Needs Attention chips, derived from the loaded matches only --
 * never from a guess. `duplicate` is set on EVERY member of a colliding group,
 * because the user has to see both rows to decide which one is real.
 *
 * Returns a Map keyed by the match object, so a row's flags survive sorting.
 */
function attentionFlags(all) {
  const flags = new Map();
  const groups = new Map();
  all.forEach(m => {
    const c = m.check || {};
    const key = `${String(c.check_number || '').trim().toLowerCase()}|${parseFloat(c.amount) || 0}`;
    if (!c.check_number || !parseFloat(c.amount)) return; // too thin to call a duplicate
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  });
  const dupes = new Set();
  groups.forEach(group => { if (group.length > 1) group.forEach(m => dupes.add(m)); });

  all.forEach(m => {
    flags.set(m, {
      lowconf: !!m.qbTxn && m.status !== 'approved' && (m.score || 0) < CONFIDENCE_FLOOR,
      duplicate: dupes.has(m),
      discrepancy: m.status === 'discrepancy',
      unmatched: m.status === 'unmatched',
    });
  });
  return flags;
}

function renderAttentionBar(all, flags) {
  const bar = $('#attention-bar');
  if (!bar) return;
  const totals = { lowconf: 0, duplicate: 0, discrepancy: 0, unmatched: 0 };
  all.forEach(m => {
    const f = flags.get(m) || {};
    Object.keys(totals).forEach(k => { if (f[k]) totals[k]++; });
  });
  Object.keys(totals).forEach(k => {
    const n = $(`#att-${k}`);
    if (n) n.textContent = totals[k];
    const chip = bar.querySelector(`[data-attention="${k}"]`);
    if (chip) {
      // A chip with nothing behind it is noise, so it hides rather than reading 0.
      chip.classList.toggle('is-empty', totals[k] === 0);
      chip.classList.toggle('is-active', _attentionFilter === k);
    }
  });
  const any = Object.values(totals).some(n => n > 0);
  bar.classList.toggle('is-shown', any);
}

function renderMatches() {
  const list = $('#match-list');
  const flags = attentionFlags(matches);
  renderAttentionBar(matches, flags);

  // Status filter
  let filtered = currentFilter === 'all' ? matches : matches.filter(m => m.status === currentFilter);
  // Approve tab: only rows that carry an Approve action.
  if (_approveMode) {
    filtered = filtered.filter(m => ['matched', 'pending', 'discrepancy'].includes(m.status));
  }
  // Needs Attention chip
  if (_attentionFilter) {
    filtered = filtered.filter(m => (flags.get(m) || {})[_attentionFilter]);
  }
  // Document filter
  if (_docFilter) {
    filtered = filtered.filter(m => (m.check || {}).job_id === _docFilter);
  }
  // Account filter — skip for unmatched rows (no qbTxn means no account to compare against)
  if (_accountFilter) {
    filtered = filtered.filter(m => !m.qbTxn || (m.qbTxn.account || '') === _accountFilter);
  }
  // Source type filter (QB transaction type) — skip for unmatched rows
  if (_matchSourceFilter) {
    filtered = filtered.filter(m => !m.qbTxn || getQBSource(m.qbTxn) === _matchSourceFilter);
  }
  // Search filter
  if (_matchSearch) {
    const q = _matchSearch.toLowerCase();
    filtered = filtered.filter(m => {
      const c = m.check || {};
      return (c.payee || '').toLowerCase().includes(q) ||
             (c.check_number || '').toLowerCase().includes(q) ||
             (c.bank_name || '').toLowerCase().includes(q) ||
             ((m.qbTxn?.payee) || '').toLowerCase().includes(q) ||
             ((m.qbTxn?.doc_number) || '').toLowerCase().includes(q);
    });
  }
  // Date filter
  if (_matchDateFrom || _matchDateTo) {
    const from = _matchDateFrom ? parseCheckDate(_matchDateFrom) : null;
    const to   = _matchDateTo   ? parseCheckDate(_matchDateTo)   : null;
    filtered = filtered.filter(m => {
      const dt = parseCheckDate((m.check || {}).check_date);
      if (!dt) return false;
      if (from && dt < from) return false;
      if (to   && dt > to)   return false;
      return true;
    });
  }

  // Apply sort
  filtered.sort((a, b) => {
    let av, bv;
    if (_sortField === 'date') {
      av = parseCheckDate((a.check || {}).check_date)?.getTime() || 0;
      bv = parseCheckDate((b.check || {}).check_date)?.getTime() || 0;
    } else if (_sortField === 'amount') {
      av = parseFloat((a.check || {}).amount) || 0;
      bv = parseFloat((b.check || {}).amount) || 0;
    } else if (_sortField === 'checknum') {
      av = parseInt(String((a.check || {}).check_number || '0').replace(/\D/g, '')) || 0;
      bv = parseInt(String((b.check || {}).check_number || '0').replace(/\D/g, '')) || 0;
    } else if (_sortField === 'score') {
      av = a.score || 0;
      bv = b.score || 0;
    } else {
      av = bv = 0;
    }
    return _sortDir === 'asc' ? av - bv : bv - av;
  });

  const counts = { all: matches.length };
  matches.forEach(m => { counts[m.status] = (counts[m.status] || 0) + 1; });
  ['all', 'pending', 'matched', 'discrepancy', 'unmatched', 'approved'].forEach(k => {
    const el = $(`#cnt-${k}`);
    if (el) el.textContent = counts[k] || 0;
  });

  // Keep bulk-approve button label + enabled state in sync
  const bulkBtn = $('#btn-bulk-approve');
  if (bulkBtn) {
    const eligible = matches.filter(m => ['matched', 'pending'].includes(m.status) && m.score >= 95).length;
    bulkBtn.textContent = `⚡ Bulk Approve ≥95% (${eligible})`;
    bulkBtn.disabled = eligible === 0;
  }

  if (filtered.length === 0) {
    const hasData = matches.length > 0;
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>${hasData ? 'No matches for this filter' : 'No matches yet'}</p>
        <p class="sub">${hasData ? 'Try clearing the search or date range' : 'Checks are loaded automatically on login.<br>Use Sync to match against QuickBooks.'}</p>
        ${!hasData ? `<button id="btn-load-match" class="btn-primary" style="margin-top:14px;padding:8px 20px;font-size:12px;">↻ Load &amp; Match Cheques</button>` : ''}
      </div>`;
    if (!hasData) $('#btn-load-match')?.addEventListener('click', () => loadChecksIntoMatches());
    return;
  }
  // Map filtered back to original indices in `matches`
  list.innerHTML = filtered.map(m => {
    const origIdx = matches.indexOf(m);
    return renderMatchRow(m, origIdx);
  }).join('');
  bindMatchEvents();
}

function renderMatchRow(m, index) {
  const check = m.check || {};
  const txn = m.qbTxn || {};
  const sc = scoreClass(m.score);
  const hasTxn = !!m.qbTxn;
  return `
    <div class="match-row status-${m.status}" data-index="${index}">
      <div class="match-main" data-toggle="${index}">
        <div class="match-check">
          <div class="num">#${check.check_number || '—'} · ${fmt(check.amount)}</div>
          <div class="detail">${fmtDate(check.check_date)} · ${escHtml(check.payee || 'No payee')}</div>
        </div>
        <div class="match-score">
          <span class="score ${sc}">${Math.round(m.score)}%</span>
          <span class="status-lbl">${m.status}</span>
        </div>
        <div class="match-qb">
          ${hasTxn ? (() => {
            const SRC_SHORT = { cheque_written: 'Written', bill_paid_by_cheque: 'Bill Pmt', cheque_received: 'Recv', payroll_check: 'Payroll' };
            const src = getQBSource(txn);
            const srcLabel = SRC_SHORT[src] || txn.txn_type || 'QB';
            const numPart = txn.doc_number ? '#' + txn.doc_number : srcLabel;
            return `
            <div class="num">${numPart} · ${fmt(txn.amount)}</div>
            <div class="detail">${fmtDate(txn.txn_date)} · ${escHtml(txn.payee || '—')} <span class="qb-type-badge" style="font-size:8px;opacity:0.8;">${srcLabel}</span></div>`;
          })() : `<div class="no-match">No QB match</div>`}
        </div>
      </div>
      <div class="match-actions">
        <button class="btn-sm btn-ghost" data-action="review" data-idx="${index}">👁 Review</button>
        ${m.status === 'unmatched' ? `<button class="btn-sm btn-ghost" data-action="search" data-idx="${index}">🔍 Find</button>` : ''}
        ${['matched', 'pending', 'discrepancy'].includes(m.status) ? `<button class="btn-sm btn-green" data-action="approve" data-idx="${index}">✅ Approve &amp; Clear</button>` : ''}
        ${m.status === 'discrepancy' && m.qbTxn ? `<button class="btn-sm btn-amber" data-action="fix" data-idx="${index}" title="Push the cheque amount to QB to resolve the discrepancy">🔧 Fix in QB</button>` : ''}
        ${m.status === 'approved' ? `<button class="btn-sm btn-ghost" data-action="undo" data-idx="${index}">↩ Undo</button>` : ''}
        ${m.status !== 'approved' ? `<button class="btn-sm btn-ghost" data-action="flag" data-idx="${index}">🚩</button>` : ''}
      </div>
      <div class="match-detail" id="detail-${index}">
        ${m.reasons ? `<div class="score-breakdown">
          ${scoreItem('Amount', m.reasons.amount || 0, 40)}
          ${scoreItem('Check #', m.reasons.checkNumber || 0, 30)}
          ${scoreItem('Date', m.reasons.date || 0, 15)}
          ${scoreItem('Payee', m.reasons.payee || 0, 15)}
        </div>` : ''}
        ${m.amtDiff > 0.01 ? `<p style="font-size:10px;color:#dc2626;margin-top:6px;">⚠ Amount diff: ${fmt(m.amtDiff)}</p>` : ''}
      </div>
    </div>`;
}

function scoreItem(label, score, max) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  return `<div class="score-item">
    <div class="lbl">${label}</div>
    <div class="score-bar"><div class="score-bar-fill ${barColor(pct)}" style="width:${pct}%"></div></div>
    <div class="val">${score}/${max}</div>
  </div>`;
}

function bindMatchEvents() {
  $$('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => $(`#detail-${el.dataset.toggle}`)?.classList.toggle('open'));
  });
  $$('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const action = btn.dataset.action;
      const match = matches[idx];
      if (!match) return;
      if (action === 'approve') { showApproveConfirm(idx); }
      else if (action === 'fix') { fixDiscrepancyInQB(idx); }
      else if (action === 'review') { openReviewModal(match.check, match); }
      else if (action === 'undo') { match.status = match.score >= 95 ? 'matched' : 'pending'; renderMatches(); }
      else if (action === 'flag') { match.status = 'flagged'; renderMatches(); }
      else if (action === 'search') {
        const query = prompt('Search QB transactions:', match.check?.payee || '');
        if (!query) return;
        showLoading('Searching QB...');
        dbg(`Searching QB: "${query}"`);
        const res = await sendMsg({ type: 'SEARCH_QB', query });
        hideLoading();
        if (res?.results?.length) {
          match.qbTxn = res.results[0];
          match.status = 'pending';
          match.score = 50;
          renderMatches();
        } else {
          alert('No QB transactions found for: ' + query);
        }
      }
    });
  });
}

// ── Approve confirmation dialog ─────────────────────────────
let _pendingApproveIdx = null;
let _pendingBulkCb = null;

function showBulkApproveConfirm(count, cb) {
  _pendingBulkCb = cb;
  _pendingApproveIdx = null;
  const titleEl = document.querySelector('#approve-confirm-overlay .approve-confirm-title');
  const descEl  = document.querySelector('#approve-confirm-overlay .approve-confirm-desc');
  const detEl   = $('#approve-confirm-details');
  const okBtn   = $('#approve-confirm-ok');
  if (titleEl) titleEl.textContent = `⚡ Bulk Approve ${count} Matches?`;
  if (descEl)  descEl.innerHTML = `This will mark <strong>${count} QuickBooks transactions</strong> as Cleared and stamp a verification note. Only matches with score ≥95% and status matched/pending are included.`;
  if (detEl)   detEl.innerHTML = `<div style="font-size:11px;color:#6b7280;padding:4px 0;">This action cannot be undone. Per-row Approve buttons process one check at a time.</div>`;
  if (okBtn)   okBtn.textContent = `⚡ Approve ${count} Matches`;
  const overlay = $('#approve-confirm-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function showApproveConfirm(idx) {
  const match = matches[idx];
  if (!match) return;
  _pendingApproveIdx = idx;
  const c = match.check || {};
  const q = match.qbTxn || {};
  const fmt = v => v != null ? `$${parseFloat(v).toFixed(2)}` : '—';
  const details = [
    ['Check #', c.check_number || '—'],
    ['Check Amount', fmt(c.amount)],
    ['Payee', c.payee || '—'],
    ['Date', c.check_date || '—'],
    ['QB Type', q.txn_type || '—'],
    ['QB Amount', fmt(q.amount)],
    ['QB Account', q.account || '—'],
    ['Action', 'Mark as Cleared in QuickBooks (bank reconciliation)'],
  ];
  const detailsEl = $('#approve-confirm-details');
  if (detailsEl) {
    detailsEl.innerHTML = details.map(([label, val]) =>
      `<div class="approve-confirm-detail-row"><span class="approve-confirm-detail-label">${label}</span><span class="approve-confirm-detail-val">${escHtml(String(val))}</span></div>`
    ).join('');
  }
  const overlay = $('#approve-confirm-overlay');
  if (overlay) overlay.style.display = 'flex';
}

function hideApproveConfirm() {
  const overlay = $('#approve-confirm-overlay');
  if (overlay) overlay.style.display = 'none';
  _pendingApproveIdx = null;
  _pendingBulkCb = null;
  // Restore single-approve defaults so next per-row use gets the right text
  const titleEl = document.querySelector('#approve-confirm-overlay .approve-confirm-title');
  const descEl  = document.querySelector('#approve-confirm-overlay .approve-confirm-desc');
  const okBtn   = $('#approve-confirm-ok');
  if (titleEl) titleEl.textContent = '✅ Approve & Clear in QuickBooks?';
  if (descEl)  descEl.innerHTML = `This will mark the QuickBooks transaction as <strong>Cleared</strong> (reconciliation status) and stamp a verification note. This does <strong>not</strong> delete anything.`;
  if (okBtn)   okBtn.textContent = '✅Approve';
}

function approveAndClear(idx) {
  const match = matches[idx];
  if (!match) return;

  // Optimistic UI: flip status + render immediately. Keep the user moving.
  ensureDebugPanelOpen();
  const checkId = match.check?.id;
  const jobId   = match.check?.job_id;
  const label   = match.check?.payee || match.qbTxn?.payee || `match[${idx}]`;
  dbg(`▶ Approve & Clear — ${label} (${match.qbTxn?.intuit_id || 'no qb id'})`);
  match.status = 'approved';
  renderMatches();

  if (!match.qbTxn) {
    if (checkId && jobId) {
      sendMsg({ type: 'UPDATE_CHECK_STATUS', checkId, jobId, status: 'approved' }).catch(() => {});
    }
    showWarningBanner('⚠️ Approved — no QB transaction linked to this check');
    dbg('Approved locally only (no QB txn linked)', 'warn');
    return;
  }

  // Fire SW request in the background; surface results via dbg + toast only.
  sendMsg({ type: 'APPROVE_AND_CLEAR', qbTxn: match.qbTxn, check: match.check || null, checkId, jobId })
    .then((res) => {
      if (!res) {
        dbg('SW: no response (timeout or crash)', 'error');
        showErrorDialog('QB Approve Failed', 'The extension service worker did not respond. Try reloading the extension.', null);
        return;
      }
      if (res.error) {
        dbg(`SW error: ${res.error}`, 'error');
        showErrorDialog('QB Approve Failed', res.error, res.qbRaw || null);
        return;
      }
      switch (res.qbStatus) {
        case 'already_cleared':
          dbg('QB already cleared ✓', 'success'); showQBConfirmation(res); break;
        case 'queued_for_reconcile':
          dbg('QB queued for Reconcile overlay — waiting for content script', 'info'); showQBConfirmation(res); break;
        case 'manual_required':
          dbg(`Manual: ${res.warning}`, 'warn'); break;
        case 'inactive_entity':
          dbg('QB note skipped — linked entity inactive', 'warn'); showQBConfirmation(res); break;
        case 'failed':
          dbg(`QB update failed: ${res.warning}`, 'error');
          showErrorDialog('QB Approve Failed', res.warning || 'QuickBooks rejected the update.', res.qbRaw || res.qbFault || null);
          break;
        default:
          if (res.warning) dbg(`QB: ${res.warning}`, 'warn');
          else { dbg('QB updated ✓', 'success'); showQBConfirmation(res); }
      }
    })
    .catch((e) => dbg(`SW exception: ${e?.message}`, 'error'));
}

// When runFullMatch tags rows with needsAutoApprove (QB intuit_id appears in
// audit_logs / kyriqApproved but the Kyriq check isn't 'approved' yet), fire
// APPROVE_AND_CLEAR in parallel for each. The SW broadcasts KYRIQ_APPROVAL_ADDED
// to open QB tabs so the content script ticks the C box, and persists to
// Supabase via the now-fixed saveCheckApproval. Returns when every promise settles.
async function autoApproveCleared() {
  // Status was already pre-flipped to 'approved' in runFullMatch for tagged
  // rows so they render in Done immediately. We just need to persist the
  // approval to Supabase + broadcast KYRIQ_APPROVAL_ADDED so the QB tab ticks
  // the C box. No loading overlay — this runs silently in the background.
  const pending = matches.filter(m => m.needsAutoApprove && m.qbTxn);
  if (pending.length === 0) return 0;

  dbg(`⚡ Background sync: ${pending.length} cleared cheque${pending.length === 1 ? '' : 's'}`, 'info');

  const rawResults = await runWithLimit(pending, 3, m =>
    sendMsg({
      type: 'APPROVE_AND_CLEAR',
      qbTxn: m.qbTxn,
      check: m.check || null,
      checkId: m.check?.id,
      jobId: m.check?.job_id,
    }).then(res => ({ m, res }))
  );
  const settled = rawResults.map(r => r?.error ? { status: 'rejected', reason: r.error } : { status: 'fulfilled', value: r });

  let ok = 0, fail = 0, persistFail = 0;
  for (const r of settled) {
    if (r.status !== 'fulfilled') { fail++; continue; }
    const { m, res } = r.value;
    if (res?.success) {
      m.status = 'approved';
      ok++;
      if (res.persisted === false) persistFail++;
    } else {
      fail++;
      dbg(`Background sync failed for #${m.check?.check_number || '?'}: ${res?.error || 'no response'}`, 'error');
    }
  }

  const parts = [`${ok} synced`];
  if (fail > 0) parts.push(`${fail} failed`);
  if (persistFail > 0) parts.push(`${persistFail} not persisted`);
  dbg(`Background sync done: ${parts.join(', ')}`, (fail > 0 || persistFail > 0) ? 'error' : 'success');
  return ok;
}

// Send a FIX_DISCREPANCY instruction to the active QB tab so the content script
// can drive the inline editor and update the QB transaction's amount to match
// the cheque's OCR'd amount. Discrepancy = OCR amount differs from QB amount.
function fixDiscrepancyInQB(idx) {
  const match = matches[idx];
  if (!match || !match.qbTxn) return;
  ensureDebugPanelOpen();

  const refNo = match.qbTxn.doc_number || match.check?.check_number || null;
  const ocrAmount = parseFloat(match.check?.amount);
  const qbAmount = parseFloat(match.qbTxn.amount);
  if (!refNo) {
    showErrorBanner('Cannot fix — no reference number on QB transaction.');
    return;
  }
  if (!isFinite(ocrAmount) || ocrAmount <= 0) {
    showErrorBanner('Cannot fix — cheque amount is missing or invalid.');
    return;
  }

  const corrections = {};
  if (Math.abs(ocrAmount - qbAmount) > 0.01) {
    corrections.payment = ocrAmount.toFixed(2);
  }
  if (Object.keys(corrections).length === 0) {
    showWarningBanner('Nothing to fix — amounts already match.');
    return;
  }

  dbg(`▶ Fix QB #${refNo}: ${JSON.stringify(corrections)}`);
  sendMsg({ type: 'FIX_DISCREPANCY', refNo: String(refNo), corrections, qbTxn: match.qbTxn })
    .then((res) => {
      if (!res) { dbg('SW: no response from FIX_DISCREPANCY', 'error'); return; }
      if (res.error) {
        dbg(`Fix failed: ${res.error}`, 'error');
        showErrorDialog('Fix Discrepancy Failed', res.error, res.detail || null);
        return;
      }
      const tabResult = res.result || {};
      if (tabResult.status === 'saved' || tabResult.status === 'saved_unverified') {
        dbg(`✓ QB row #${refNo} updated to ${corrections.payment}`, 'success');
        showSuccessBanner(`Fixed QB #${refNo}: payment set to $${corrections.payment}`);
        // Flip the local match to matched so it leaves the discrepancy bucket
        match.status = 'matched';
        if (match.qbTxn) match.qbTxn.amount = ocrAmount;
        renderMatches();
      } else {
        const detail = tabResult.status || 'no QB tab responded';
        dbg(`Fix result: ${detail}`, 'warn');
        showWarningBanner(`Fix did not complete: ${detail}. Open the Reconcile page in QB and try again.`);
      }
    })
    .catch((e) => dbg(`Fix SW exception: ${e?.message}`, 'error'));
}

function showBanner(msg, type = 'warn', autoHideMs = 8000) {
  const banner = $('#match-banner');
  if (!banner) return;
  banner.textContent = msg;
  banner.className = `match-banner banner-${type}`;
  banner.style.removeProperty('background');
  banner.style.removeProperty('color');
  banner.style.display = '';
  if (autoHideMs > 0) setTimeout(() => { if (banner) banner.style.display = 'none'; }, autoHideMs);
}
function showWarningBanner(msg) { showBanner(msg, 'warn', 8000); }
function showSuccessBanner(msg) { showBanner(msg, 'success', 6000); }
function showErrorBanner(msg)   { showBanner(msg, 'error',   10000); }

// ── Persistent error dialog with copyable raw QB body ────────
function showErrorDialog(title, msg, rawBody) {
  const overlay = $('#error-dialog-overlay');
  if (!overlay) return;
  $('#error-dialog-title').textContent = title || 'Error';
  $('#error-dialog-msg').textContent   = msg   || 'An unknown error occurred.';
  const rawWrap = $('#error-dialog-raw-wrap');
  const rawPre  = $('#error-dialog-raw');
  if (rawBody && rawWrap && rawPre) {
    let display = rawBody;
    try { display = JSON.stringify(JSON.parse(rawBody), null, 2); } catch {}
    rawPre.textContent  = display;
    rawWrap.style.display = '';
    rawWrap.removeAttribute('open');
  } else if (rawWrap) {
    rawWrap.style.display = 'none';
  }
  overlay.style.display = '';
}
function hideErrorDialog() {
  const overlay = $('#error-dialog-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ── QB confirmation toast — shows what was actually written + View in QB link ──
function showQBConfirmation(res) {
  const noteStamped = res?.noteStamped === true;
  const qbStatus    = res?.qbStatus;
  const AUTO_MS     = 12000;

  // Truthful title/subtext — no fabricated "cleared in QuickBooks" copy.
  const title =
    qbStatus === 'already_cleared'      ? 'Approved — already Cleared in QuickBooks' :
    qbStatus === 'queued_for_reconcile' ? 'Approved — awaiting QB Reconcile'         :
    qbStatus === 'manual_required'      ? 'Approved — mark Cleared manually in QB'   :
    qbStatus === 'inactive_entity'      ? 'Approved in Kyriq ✓ — QB not stamped'     :
    noteStamped                         ? 'Approved — PrivateNote stamped in QB'     :
                                          'Approved in Kyriq';

  const sub =
    qbStatus === 'already_cleared'      ? 'QB already had this transaction cleared.' :
    qbStatus === 'queued_for_reconcile' ? 'Open QB Reconcile and click "Auto-Clear Kyriq Approved" to tick the C.' :
    qbStatus === 'manual_required'      ? 'Bill Payment cleared-status cannot be set via the QB API — tick it in Reconcile.' :
    qbStatus === 'inactive_entity'      ? 'A vendor or account linked to this QB transaction has been made inactive. Reactivate it in QuickBooks, then re-approve to stamp the note.' :
    noteStamped                         ? 'Kyriq audit note written to QuickBooks.' :
                                          '';

  const showReconcileCta =
    qbStatus === 'queued_for_reconcile' || qbStatus === 'manual_required';

  // Remove any existing toast and cancel its auto-dismiss timer
  const _oldToast = document.getElementById('kyriq-qb-toast');
  if (_oldToast) {
    if (_oldToast._dismissTimer) clearTimeout(_oldToast._dismissTimer);
    _oldToast.remove();
  }

  const toast = document.createElement('div');
  toast.id = 'kyriq-qb-toast';
  toast.className = 'kyriq-toast';
  toast.innerHTML = `
    <span class="kyriq-toast-icon">${qbStatus === 'already_cleared' ? '✅' : qbStatus === 'inactive_entity' ? '⚠️' : '🏦'}</span>
    <div class="kyriq-toast-body">
      <div class="kyriq-toast-title">${escHtml(title)}</div>
      <div class="kyriq-toast-sub">${escHtml(sub)}</div>
      <div class="kyriq-toast-actions">
        ${showReconcileCta ? `<button class="kyriq-toast-btn kyriq-toast-btn-primary" data-act="open-reconcile">Open QB Reconcile →</button>` : ''}
        ${showReconcileCta ? `<button class="kyriq-toast-btn" data-act="open-register">Open QB Register →</button>` : ''}
        ${res?.qbUrl ? `<a class="kyriq-toast-link" href="${escHtml(res.qbUrl)}" target="_blank">View in QB →</a>` : ''}
      </div>
    </div>
    <button class="kyriq-toast-close" title="Dismiss">✕</button>
    <div class="kyriq-toast-progress" style="animation-duration:${AUTO_MS}ms;"></div>
  `;

  function dismiss() {
    if (!toast.isConnected) return; // already removed
    clearTimeout(toast._dismissTimer);
    toast.classList.add('kyriq-toast-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
    setTimeout(() => { if (toast.isConnected) toast.remove(); }, 600); // fallback if no animation
  }

  const closeBtn = toast.querySelector('.kyriq-toast-close');
  toast._dismissTimer = setTimeout(dismiss, AUTO_MS);
  closeBtn?.addEventListener('click', () => { clearTimeout(toast._dismissTimer); dismiss(); });

  const acct = getSelectedQbAccount();

  const reconBtn = toast.querySelector('[data-act="open-reconcile"]');
  if (reconBtn) {
    reconBtn.addEventListener('click', async () => {
      clearTimeout(toast._dismissTimer);
      try {
        const r = await sendMsg({ type: 'OPEN_QB_RECONCILE', accountId: acct?.id || null });
        if (!r?.success) dbg(`OPEN_QB_RECONCILE returned ${JSON.stringify(r)}`, 'warn');
      } catch (e) {
        dbg(`OPEN_QB_RECONCILE failed: ${e?.message || e}`, 'warn');
      }
      dismiss();
    });
  }

  const regBtn = toast.querySelector('[data-act="open-register"]');
  if (regBtn) {
    regBtn.addEventListener('click', async () => {
      clearTimeout(toast._dismissTimer);
      try {
        const r = await sendMsg({ type: 'OPEN_QB_REGISTER', accountId: acct?.id || null });
        if (!r?.success) dbg(`OPEN_QB_REGISTER returned ${JSON.stringify(r)}`, 'warn');
      } catch (e) {
        dbg(`OPEN_QB_REGISTER failed: ${e?.message || e}`, 'warn');
      }
      dismiss();
    });
  }

  document.body.appendChild(toast);
}

// ── Upload workflow (3-step) ──────────────────────────────────
function setUploadStep(step) {
  ['#upload-step-1', '#upload-step-2', '#upload-step-3'].forEach((s, i) => {
    const el = $(s); if (el) el.style.display = (i + 1 === step) ? '' : 'none';
  });
  $$('.step-item').forEach(item => {
    const n = parseInt(item.dataset.step);
    item.classList.toggle('active', n === step);
    item.classList.toggle('done', n < step);
  });
  dbg(`Upload step → ${step}`);
}

function renderFileQueue() {
  const queue = $('#file-queue');
  if (!pendingFiles.length) { hide(queue); hide('#btn-next-configure'); return; }
  show(queue);
  show('#btn-next-configure');
  queue.innerHTML = pendingFiles.map((f, i) => `
    <div class="file-item">
      <span class="file-item-name">📄 ${escHtml(f.name)}</span>
      <span class="file-item-meta">${fmtSize(f.size)}</span>
      <button class="file-item-remove" data-fi="${i}" title="Remove">✕</button>
    </div>`).join('');
  queue.querySelectorAll('[data-fi]').forEach(btn => {
    btn.addEventListener('click', () => {
      pendingFiles.splice(parseInt(btn.dataset.fi), 1);
      renderFileQueue();
    });
  });
}

// ── Step 2→3: Upload PDF to backend then start extraction ──
async function runExtraction() {
  if (!pendingFiles.length) return;
  const file = pendingFiles[0]; // one PDF at a time
  setUploadStep(3);
  clearProgressLog();
  hide('#extraction-results');
  const spinner = $('#progress-spinner');
  spinner?.classList.remove('done');
  extractedChecks = [];
  currentJobId = null;
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }

  // ── Duplicate check ──
  appendLog(`Checking for duplicates...`, 'info');
  $('#progress-summary').textContent = 'Checking for duplicates...';
  const existingRes = await sendMsg({ type: 'GET_DOCUMENTS' });
  const existing = existingRes?.documents || [];
  const duplicate = existing.find(d =>
    d.pdf_name && file.name &&
    d.pdf_name.toLowerCase() === file.name.toLowerCase()
  );
  if (duplicate) {
    const dupDate = duplicate.created_at
      ? new Date(duplicate.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'previously';
    const proceed = confirm(
      `"${file.name}" was already uploaded ${dupDate}.\n\nDo you want to upload it again?`
    );
    if (!proceed) {
      appendLog(`Cancelled — duplicate detected: "${file.name}"`, 'err');
      spinner?.classList.add('done');
      $('#progress-summary').textContent = 'Cancelled (duplicate)';
      setUploadStep(1);
      return;
    }
    appendLog(`Duplicate confirmed — re-uploading "${file.name}"`, 'info');
  }

  appendLog(`Uploading: ${file.name} (${fmtSize(file.size)})`, 'info');
  $('#progress-summary').textContent = 'Uploading PDF...';

  // ── Upload ──
  let base64;
  try {
    base64 = await fileToBase64(file);
  } catch (e) {
    appendLog(`✗ Could not read file: ${e.message}`, 'err');
    spinner?.classList.add('done');
    return;
  }

  const uploadRes = await sendMsg({
    type: 'UPLOAD_DOCUMENT',
    fileBase64: base64,
    fileName: file.name,
    fileSize: file.size,
  });

  if (uploadRes?.error || !uploadRes?.job_id) {
    appendLog(`✗ Upload failed: ${uploadRes?.error || 'no job_id returned'}`, 'err');
    spinner?.classList.add('done');
    $('#progress-summary').textContent = 'Upload failed';
    return;
  }

  currentJobId = uploadRes.job_id;
  appendLog(`✓ Uploaded — job ${currentJobId}`, 'ok');
  appendLog(`Starting extraction (${selectedMethod})...`, 'info');
  $('#progress-summary').textContent = 'Starting extraction...';

  // ── Start extraction ──
  const methodMap = { ai: ['gemini'], tesseract: ['tesseract'], hybrid: ['hybrid'] };
  const methods = methodMap[selectedMethod] || ['hybrid'];
  const extractRes = await sendMsg({
    type: 'START_EXTRACTION',
    jobId: currentJobId,
    methods,
  });

  if (extractRes?.error) {
    appendLog(`✗ Extraction start failed: ${extractRes.error}`, 'err');
    spinner?.classList.add('done');
    $('#progress-summary').textContent = 'Extraction failed to start';
    return;
  }

  appendLog(`Extraction running — polling for results...`, 'info');
  $('#progress-summary').textContent = 'Processing...';

  // ── Poll until complete ──
  const DONE_STATUSES = ['complete', 'error'];
  let attempts = 0;
  const MAX_POLLS = 120; // 4 minutes max

  _pollTimer = setInterval(async () => {
    attempts++;
    if (attempts > MAX_POLLS) {
      clearInterval(_pollTimer); _pollTimer = null;
      appendLog('⚠ Timed out waiting for extraction', 'err');
      spinner?.classList.add('done');
      $('#progress-summary').textContent = 'Timed out';
      return;
    }
    let pollRes;
    try {
      pollRes = await sendMsg({ type: 'POLL_JOB', jobId: currentJobId });
    } catch (pollErr) {
      dbg(`Poll error: ${pollErr?.message}`, 'error');
      return; // skip this tick, retry next
    }
    const job = pollRes?.job;
    if (!job) return;

    const status = job.status || 'pending';
    const progress = job.extraction_progress != null ? ` (${Math.round(job.extraction_progress * 100)}%)` : '';
    $('#progress-summary').textContent = `${status}${progress}`;

    if (DONE_STATUSES.includes(status)) {
      clearInterval(_pollTimer); _pollTimer = null;
      spinner?.classList.add('done');

      if (status === 'error') {
        appendLog(`✗ Extraction error: ${job.error_message || job.error || 'unknown'}`, 'err');
        $('#progress-summary').textContent = 'Extraction failed';
        return;
      }

      // Parse checks — backend returns `checks` (array), legacy used `checks_data` (JSON string)
      let checksData = job.checks || [];
      if (!checksData.length && job.checks_data) {
        try {
          checksData = typeof job.checks_data === 'string'
            ? JSON.parse(job.checks_data)
            : job.checks_data;
        } catch (parseErr) {
          dbg(`checks_data JSON parse failed: ${parseErr?.message}`, 'error');
          checksData = [];
        }
      }

      extractedChecks = checksData.map(c => {
        const ext = c.extraction || {};
        return {
          check_number: ext.checkNumber?.value || ext.checkNumber || null,
          amount: parseFloat((ext.amount?.value || ext.amount || '0').toString().replace(/[^0-9.]/g, '')) || null,
          payee: ext.payee?.value || ext.payee || null,
          check_date: ext.checkDate?.value || ext.checkDate || null,
          bank_name: ext.bankName?.value || ext.bankName || null,
          memo: ext.memo?.value || ext.memo || null,
          _fileName: job.pdf_name || file.name,
          _checkId: c.check_id,
        };
      });

      appendLog(`✓ Done — ${extractedChecks.length} cheques extracted from ${job.total_pages || '?'} pages`, 'ok');
      $('#progress-summary').textContent = `Complete — ${extractedChecks.length} cheques`;
      renderExtracted();

      // Refresh docs cache so the new file appears in the Docs dropdown immediately
      _cachedDocs = null;
      loadDocuments(true).catch(() => {});
    }
  }, 2000);
}

function renderExtracted() {
  if (!extractedChecks.length) { hide('#extraction-results'); return; }
  show('#extraction-results');
  $('#results-count').textContent = extractedChecks.length;
  $('#extracted-list').innerHTML = extractedChecks.map(c => `
    <div class="extracted-card">
      <div class="field"><span class="label">File</span><span class="value">${escHtml(c._fileName || '—')}</span></div>
      <div class="field"><span class="label">Check #</span><span class="value">${escHtml(c.check_number || '—')}</span></div>
      <div class="field"><span class="label">Amount</span><span class="value">${fmt(c.amount)}</span></div>
      <div class="field"><span class="label">Date</span><span class="value">${c.check_date || '—'}</span></div>
      <div class="field"><span class="label">Payee</span><span class="value">${escHtml(c.payee || '—')}</span></div>
      <div class="field"><span class="label">Bank</span><span class="value">${escHtml(c.bank_name || '—')}</span></div>
      ${c.memo ? `<div class="field"><span class="label">Memo</span><span class="value">${escHtml(c.memo)}</span></div>` : ''}
    </div>`).join('');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── QB Transactions (from Supabase qb_entries table) ────────────
async function loadQBTransactions(force = false) {
  if (_inflightQB) { dbg('loadQBTransactions: reusing in-flight load'); return _inflightQB; }
  if (_cachedQB !== null && !force) { renderQBList(_cachedQB); return; }
  _inflightQB = (async () => {
    dbg('loadQBTransactions' + (force ? ' (force)' : ''));
    const list = $('#qb-list');
    if (list) list.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading…</p></div>';
    const res = await sendMsg({ type: 'GET_QB_TXNS' });
    const txns = res?.txns || [];
    const status = res?.status || 'ok';
    dbg(`QB Transactions: ${txns.length} (${status})`);

    // Do NOT cache when the fetch couldn't run (auth / tenant / network failure).
    if (status === 'ok' || status === 'empty') {
      _cachedQB = txns;
    } else {
      _cachedQB = null;
    }
    renderQBList(txns, status);
  })().finally(() => { _inflightQB = null; });
  return _inflightQB;
}

function renderQBList(txns, status = 'ok') {
  const list = $('#qb-list');
  if (!list) return;

  // Truthful empty-state messages per status — no more "No QB transactions yet"
  // when the real reason is "not signed in" or "no tenant".
  if (!txns.length && status !== 'ok' && status !== 'empty') {
    const MAP = {
      not_authed:   { icon: '🔒', msg: 'Sign in to Kyriq to load QB data',      sub: 'Open the Kyriq web app and sign in, then reopen this panel.' },
      no_tenant:    { icon: '👤', msg: 'Your profile has no tenant_id',          sub: 'Contact your Kyriq admin to link you to a workspace.' },
      fetch_failed: { icon: '⚠️', msg: 'Could not reach Kyriq database',         sub: 'Check your connection and click Refresh.' },
    };
    const m = MAP[status] || { icon: '🏦', msg: 'No QB transactions yet', sub: 'Click Sync to pull transactions from QuickBooks' };
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">${m.icon}</div><p>${m.msg}</p><p class="sub">${m.sub}</p></div>`;
    const badge = $('#qb-count-badge');
    if (badge) { badge.textContent = '0'; badge.style.background = 'var(--amber)'; }
    return;
  }

  // Apply account filter
  let filtered = _accountFilter ? txns.filter(t => (t.account || '') === _accountFilter) : txns;
  // Apply source type filter
  if (_qbSourceFilter) {
    filtered = filtered.filter(t => (t.qb_source || '') === _qbSourceFilter);
  }
  // Apply search filter
  if (_qbSearch) {
    const q = _qbSearch.toLowerCase();
    filtered = filtered.filter(t =>
      (t.payee || '').toLowerCase().includes(q) ||
      (t.doc_number || '').toLowerCase().includes(q) ||
      (t.account || '').toLowerCase().includes(q) ||
      (t.txn_type || '').toLowerCase().includes(q) ||
      String(t.amount || '').includes(q)
    );
  }
  // Apply date filter
  if (_qbDateFrom || _qbDateTo) {
    const from = _qbDateFrom ? new Date(_qbDateFrom) : null;
    const to   = _qbDateTo   ? new Date(_qbDateTo)   : null;
    filtered = filtered.filter(t => {
      if (!t.txn_date) return false;
      const dt = new Date(t.txn_date);
      if (from && dt < from) return false;
      if (to   && dt > to)   return false;
      return true;
    });
  }

  // Update count badge
  const badge = $('#qb-count-badge');
  if (badge) {
    const showing = filtered.length, total = txns.length;
    badge.textContent = showing < total ? `${showing} / ${total}` : String(total);
    badge.style.background = showing < total ? 'var(--amber)' : 'var(--green)';
  }

  if (!filtered.length) {
    const msg = txns.length ? 'No transactions match the current filter' : 'No QB transactions yet';
    const sub = txns.length ? 'Try clearing the search or date range' : 'Click Sync to pull transactions from QuickBooks';
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🏦</div><p>${msg}</p><p class="sub">${sub}</p></div>`;
    return;
  }

  const SRC_LABEL = {
    cheque_written:      { icon: '✏️', label: 'Written' },
    bill_paid_by_cheque: { icon: '�', label: 'Bill Pmt' },
    cheque_received:     { icon: '✉️', label: 'Received' },
    payroll_check:       { icon: '�', label: 'Payroll' },
  };
  list.innerHTML = filtered.map(t => {
    const src    = getQBSource(t);
    const srcMeta = SRC_LABEL[src] || { icon: '💳', label: t.txn_type || 'Txn' };
    const date   = t.txn_date ? fmtDate(t.txn_date) : '—';
    const payee  = t.payee ? escHtml(t.payee) : 'No payee';
    const amount = fmt(t.amount);
    const acct   = t.account ? escHtml(t.account) : '';
    const doc    = t.doc_number ? `#${escHtml(t.doc_number)}` : '';
    const memo   = t.memo ? `<div class="qb-card-memo">${escHtml(t.memo)}</div>` : '';
    return `
      <div class="qb-card">
        <div class="qb-card-icon">${srcMeta.icon}</div>
        <div class="qb-card-body">
          <div class="qb-card-top">
            <span class="qb-card-payee">${payee}</span>
            <span class="qb-card-amount">${amount}</span>
          </div>
          <div class="qb-card-meta">${date}${doc ? ' · ' + doc : ''} · <span class="qb-type-badge">${srcMeta.label}</span>${acct ? ' · ' + acct : ''}</div>
          ${memo}
        </div>
      </div>`;
  }).join('');
}

// ── Documents (from Supabase check_jobs table) ────────────────────────
async function loadDocuments(force = false) {
  if (_inflightDocs) { dbg('loadDocuments: reusing in-flight load'); return _inflightDocs; }
  const list = $('#documents-list');
  if (_cachedDocs !== null && !force) { renderDocumentsList(_cachedDocs); return; }
  _inflightDocs = (async () => {
    dbg('loadDocuments' + (force ? ' (force)' : ''));
    if (list) list.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading...</p></div>';
    const res = await sendMsg({ type: 'GET_DOCUMENTS' });
    const docs = res?.documents || [];
    dbg(`Documents: ${docs.length}`);
    _cachedDocs = docs;
    populateDocFilter(docs);
    renderDocumentsList(docs);
  })().finally(() => { _inflightDocs = null; });
  return _inflightDocs;
}
function renderDocumentsList(docs) {
  const list = $('#documents-list');
  if (!docs.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📁</div><p>No documents yet</p><p class="sub">Upload check PDFs in the Upload tab or in the web app</p></div>`;
    return;
  }
  const statusLabel = { complete: 'Complete', analyzed: 'Ready', extracting: 'Processing', ocr: 'OCR', ocr_running: 'OCR...', pending: 'Pending', error: 'Error' };
  const statusClass = { complete: 'complete', analyzed: 'complete', extracting: 'extracting', ocr_running: 'extracting', error: 'error' };
  list.innerHTML = docs.map(d => {
    const label = statusLabel[d.status] || d.status || 'Unknown';
    const cls = statusClass[d.status] || 'pending';
    const date = d.created_at ? fmtDate(d.created_at) : '—';
    const pages = d.total_pages ? ` · ${d.total_pages}p` : '';
    const isDone = ['complete', 'analyzed'].includes(d.status);
    return `
      <div class="doc-card" data-job="${escHtml(d.job_id)}">
        <div class="doc-icon">📄</div>
        <div class="doc-info">
          <div class="doc-name">${escHtml(d.pdf_name || 'Untitled')}</div>
          <div class="doc-meta">${date}${pages} · ${d.total_checks || 0} cheques</div>
        </div>
        <div class="doc-status ${cls}">${label}</div>
        <button class="btn-xs btn-doc-delete" data-job="${escHtml(d.job_id)}" title="Delete upload">🗑</button>
      </div>`;
  }).join('');
  list.querySelectorAll('.btn-doc-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const jobId = btn.dataset.job;
      const docName = docs.find(d => d.job_id === jobId)?.pdf_name || jobId;
      if (!confirm(`Delete "${docName}" and all its extracted checks?\n\nThis cannot be undone.`)) return;
      btn.disabled = true;
      btn.textContent = '⏳';
      const res = await sendMsg({ type: 'DELETE_DOCUMENT', jobId });
      if (res?.error) {
        dbg(`Delete failed: ${res.error}`, 'error');
        showErrorDialog('Delete Failed', res.error);
        btn.disabled = false;
        btn.textContent = '🗑';
        return;
      }
      _cachedDocs = (_cachedDocs || []).filter(d => d.job_id !== jobId);
      _cachedChecks = null;
      populateDocFilter(_cachedDocs);
      renderDocumentsList(_cachedDocs);
      dbg(`Deleted document: ${docName}`, 'success');
    });
  });
}

// ── Extracted Cheques (from Supabase checks table) ────────
async function loadChecks(force = false) {
  if (_inflightChecks) { dbg('loadChecks: reusing in-flight load'); return _inflightChecks; }
  if (_cachedChecks !== null && !force) { renderChecksList(_cachedChecks); return; }
  _inflightChecks = (async () => {
    dbg('loadChecks' + (force ? ' (force)' : ''));
    const list = $('#checks-list');
    if (list) list.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading...</p></div>';
    const res = await sendMsg({ type: 'GET_CHECKS' });
    const checks = res?.checks || [];
    dbg(`Checks: ${checks.length}`);
    _cachedChecks = checks;
    renderChecksList(checks);
  })().finally(() => { _inflightChecks = null; });
  return _inflightChecks;
}
function renderChecksList(checks) {
  const list = $('#checks-list');
  // Apply doc filter
  let filtered = _chequeDocFilter ? checks.filter(c => c.job_id === _chequeDocFilter) : checks;
  // Apply search + date filters
  if (_checksSearch) {
    const q = _checksSearch.toLowerCase();
    filtered = filtered.filter(c =>
      (c.payee || '').toLowerCase().includes(q) ||
      (c.check_number || '').toLowerCase().includes(q) ||
      (c.bank_name || '').toLowerCase().includes(q) ||
      (c.source_file || '').toLowerCase().includes(q)
    );
  }
  if (_checksDateFrom || _checksDateTo) {
    const from = _checksDateFrom ? parseCheckDate(_checksDateFrom) : null;
    const to   = _checksDateTo   ? parseCheckDate(_checksDateTo)   : null;
    filtered = filtered.filter(c => {
      const dt = parseCheckDate(c.check_date);
      if (!dt) return false;
      if (from && dt < from) return false;
      if (to   && dt > to)   return false;
      return true;
    });
  }
  // Update count badge
  const badge = $('#checks-count-badge');
  if (badge) {
    const showing = filtered.length;
    const total   = checks.length;
    badge.textContent = showing < total ? `${showing} / ${total}` : String(total);
    badge.style.background = showing < total ? 'var(--amber)' : 'var(--green)';
  }
  if (!filtered.length) {
    const msg = checks.length ? 'No cheques match the current filter' : 'No extracted cheques yet';
    const sub = checks.length ? 'Try clearing the search or date range' : 'Cheques extracted in the web app will appear here';
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">💸</div><p>${msg}</p><p class="sub">${sub}</p></div>`;
    return;
  }
  list.innerHTML = filtered.map((c, i) => {
    // Keep original index for openReviewModal (needs to match _cachedChecks)
    const origIdx = checks.indexOf(c);
    const num = c.check_number ? `#${escHtml(c.check_number)}` : '—';
    const date = c.check_date ? fmtDate(c.check_date) : '';
    const payee = c.payee ? escHtml(c.payee) : 'No payee';
    const statusCls = (c.status || 'pending_review').replace(/[^a-z_]/g, '');
    const statusLabel = { pending_review: 'Review', approved: 'Approved', rejected: 'Rejected', exported: 'Exported', duplicate: 'Dupe', error: 'Error' }[c.status] || c.status || '?';
    const isPending = !['approved', 'rejected'].includes(c.status);
    return `
      <div class="check-card">
        <div class="check-card-main">
          <div class="check-card-num">${num} · ${payee}</div>
          <div class="check-card-meta">${date}${date ? ' · ' : ''}${escHtml(c.source_file || '')}</div>
        </div>
        <span class="check-card-amount">${fmt(c.amount)}</span>
        ${isPending
          ? `<button class="check-review-btn" data-idx="${origIdx}">👁 Review</button>`
          : `<span class="check-card-status ${statusCls}">${statusLabel}</span>`}
      </div>`;
  }).join('');
  // Bind REVIEW buttons
  list.querySelectorAll('.check-review-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      openReviewModal(_cachedChecks[idx]);
    });
  });
}
// ── Helper: diff cell for comparison table ──
function diffCell(extVal, qbVal, type = 'text') {
  if (!qbVal && qbVal !== 0) return '<td class="rm-diff na">—</td>';
  if (type === 'amount') {
    const delta = (parseFloat(extVal) || 0) - (parseFloat(qbVal) || 0);
    if (Math.abs(delta) < 0.01) return '<td class="rm-diff match">✓ Match</td>';
    const sign = delta > 0 ? '+' : '';
    return `<td class="rm-diff diff">${sign}${fmt(delta)}</td>`;
  }
  if (type === 'date') {
    const d1 = parseCheckDate(extVal), d2 = parseCheckDate(qbVal);
    if (!d1 || !d2) return '<td class="rm-diff na">—</td>';
    const days = Math.round((d1 - d2) / 86400000);
    if (days === 0) return '<td class="rm-diff match">✓ Same</td>';
    return `<td class="rm-diff diff">${days > 0 ? '+' : ''}${days}d</td>`;
  }
  // text
  const a = String(extVal || '').trim().toLowerCase();
  const b = String(qbVal  || '').trim().toLowerCase();
  if (!a || !b) return '<td class="rm-diff na">—</td>';
  return a === b
    ? '<td class="rm-diff match">✓ Match</td>'
    : '<td class="rm-diff diff">≠ Diff</td>';
}

function openReviewModal(check, match = null) {
  _reviewCheck = check;
  _reviewMatch = match;
  const m = $('#review-modal');
  if (!m) return;
  const txn = match?.qbTxn || null;

  // Header
  m.querySelector('#rm-check-num').textContent = check.check_number ? '#' + check.check_number : '—';
  m.querySelector('#rm-status').textContent = (check.status || 'pending_review').replace(/_/g, ' ');

  // Score badge
  const badge = m.querySelector('#rm-score-badge');
  if (badge) {
    if (match?.score != null) {
      badge.textContent = `${Math.round(match.score)}% ${match.status || ''}`;
      badge.className = `rm-score-badge score-badge-${scoreClass(match.score)}`;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  // Always show all 3 columns
  ['#rm-qb-head', '#rm-diff-head'].forEach(sel => { const el = m.querySelector(sel); if (el) el.style.display = ''; });

  // Populate Extracted inputs
  const setInp = (id, val) => { const el = m.querySelector(id); if (el) el.value = val != null ? String(val) : ''; };
  setInp('#rmi-amount',   check.amount != null ? check.amount : '');
  setInp('#rmi-date',     check.check_date ? fmtDate(check.check_date) : '');
  setInp('#rmi-payee',    check.payee || '');
  setInp('#rmi-checknum', check.check_number || '');

  // Populate QB inputs — empty + red border class when no QB data
  const qbInputs = ['#rmq-amount', '#rmq-date', '#rmq-payee', '#rmq-checknum'];
  qbInputs.forEach(sel => {
    const el = m.querySelector(sel);
    if (!el) return;
    el.classList.toggle('rm-input-missing', !txn);
  });

  if (txn) {
    setInp('#rmq-amount',   txn.amount != null ? txn.amount : '');
    setInp('#rmq-date',     txn.txn_date ? fmtDate(txn.txn_date) : '');
    setInp('#rmq-payee',    txn.payee || '');
    setInp('#rmq-checknum', txn.doc_number || '');
  } else {
    qbInputs.forEach(sel => { const el = m.querySelector(sel); if (el) el.value = ''; });
  }

  // Wire live diff recalc on ALL inputs (both Extracted and QB)
  const allInputIds = ['#rmi-amount','#rmi-date','#rmi-payee','#rmi-checknum',
                       '#rmq-amount','#rmq-date','#rmq-payee','#rmq-checknum'];
  allInputIds.forEach(sel => {
    const inp = m.querySelector(sel);
    if (inp) inp.oninput = () => updateModalDiffs(m);
  });

  // Initial diff calc
  updateModalDiffs(m);

  // Extra extracted-only fields
  const setTxt = (id, val) => { const el = m.querySelector(id); if (el) el.textContent = val || '—'; };
  setTxt('#rm-bank',    check.bank_name);
  setTxt('#rm-acct',    check.account_number);
  setTxt('#rm-routing', check.routing_number);
  setTxt('#rm-memo',    check.memo);
  setTxt('#rm-source',  check.source_file);

  // Image
  const imgEl = m.querySelector('#rm-image');
  if (imgEl) {
    if (check.image_url) {
      imgEl.src = check.image_url;
      imgEl.style.display = '';
      m.querySelector('#rm-no-image').style.display = 'none';
    } else {
      imgEl.style.display = 'none';
      m.querySelector('#rm-no-image').style.display = '';
    }
  }

  // Save feedback reset
  const fb = m.querySelector('#rm-save-feedback');
  if (fb) fb.style.display = 'none';

  // Action buttons
  const approveBtn = m.querySelector('#rm-approve');
  const rejectBtn  = m.querySelector('#rm-reject');
  const undoBtn    = m.querySelector('#rm-undo');
  if (approveBtn) approveBtn.style.display = check.status === 'approved' ? 'none' : '';
  if (rejectBtn)  rejectBtn.style.display  = check.status === 'rejected'  ? 'none' : '';
  if (undoBtn)    undoBtn.style.display    = ['approved','rejected'].includes(check.status) ? '' : 'none';

  m.style.display = '';
}

// Reads current input values from the modal and recomputes the Δ Diff column
function updateModalDiffs(m) {
  if (!m) m = $('#review-modal');
  if (!m) return;
  const setDiff = (id, text, cls) => {
    const el = m.querySelector(id);
    if (!el) return;
    el.textContent = text;
    el.className = `rm-diff-col rm-diff ${cls}`;
  };

  const extAmt  = m.querySelector('#rmi-amount')?.value.trim()   || '';
  const extDate = m.querySelector('#rmi-date')?.value.trim()     || '';
  const extPay  = m.querySelector('#rmi-payee')?.value.trim()    || '';
  const extCN   = m.querySelector('#rmi-checknum')?.value.trim() || '';
  const qbAmt   = m.querySelector('#rmq-amount')?.value.trim()   || '';
  const qbDate  = m.querySelector('#rmq-date')?.value.trim()     || '';
  const qbPay   = m.querySelector('#rmq-payee')?.value.trim()    || '';
  const qbCN    = m.querySelector('#rmq-checknum')?.value.trim() || '';

  // Amount
  if (!extAmt || !qbAmt) { setDiff('#rmd-amount', '—', 'na'); }
  else {
    const ea = parseFloat(extAmt.replace(/[^0-9.-]/g, '')) || 0;
    const qa = parseFloat(qbAmt.replace(/[^0-9.-]/g, ''))  || 0;
    const d  = ea - qa;
    if (Math.abs(d) < 0.01) setDiff('#rmd-amount', '✓ Match', 'match');
    else setDiff('#rmd-amount', `${d > 0 ? '+' : ''}${fmt(d)}`, 'diff');
  }
  // Date
  if (!extDate || !qbDate) { setDiff('#rmd-date', '—', 'na'); }
  else {
    const d1 = parseDateInput(extDate), d2 = parseDateInput(qbDate);
    if (!d1 || !d2) setDiff('#rmd-date', '—', 'na');
    else {
      const days = Math.round((d1 - d2) / 86400000);
      setDiff('#rmd-date', days === 0 ? '✓ Same' : `${days > 0 ? '+' : ''}${days}d`, days === 0 ? 'match' : 'diff');
    }
  }
  // Payee
  if (!extPay || !qbPay) { setDiff('#rmd-payee', '—', 'na'); }
  else {
    const same = extPay.toLowerCase() === qbPay.toLowerCase();
    setDiff('#rmd-payee', same ? '✓ Match' : '≠ Diff', same ? 'match' : 'diff');
  }
  // Check #
  if (!extCN || !qbCN) { setDiff('#rmd-checknum', '—', 'na'); }
  else {
    const c1 = extCN.replace(/\D/g,'').replace(/^0+/,'');
    const c2 = qbCN.replace(/\D/g,'').replace(/^0+/,'');
    setDiff('#rmd-checknum', c1 === c2 ? '✓ Match' : '≠ Diff', c1 === c2 ? 'match' : 'diff');
  }

  // Show "Fix All Discrepancies" only when at least one field differs and QB data exists
  const hasDiffs = !!m.querySelector('.rm-diff.diff');
  const fixBtn = m.querySelector('#rm-fix-all');
  if (fixBtn) fixBtn.style.display = hasDiffs ? '' : 'none';
}

// ── History (approved checks from Supabase) ─────────────
async function loadHistory(force = false) {
  dbg('loadHistory' + (force ? ' (force)' : ''));
  if (_cachedHistory !== null && !force) { renderHistoryList(_cachedHistory); return; }
  const list = $('#history-list');
  list.innerHTML = '<div class="empty-state"><div class="empty-icon">⏳</div><p>Loading...</p></div>';
  const res = await sendMsg({ type: 'GET_HISTORY' });
  const hist = res?.history || [];
  dbg(`History: ${hist.length}`);
  _cachedHistory = hist;
  renderHistoryList(hist);
}
function renderHistoryList(hist) {
  const list = $('#history-list');
  if (!hist.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">✅</div><p>No approved cheques yet</p><p class="sub">Cheques marked as approved will appear here</p></div>`;
    return;
  }
  list.innerHTML = hist.map(h => {
    const num = h.check_number ? `#${escHtml(h.check_number)}` : '—';
    const date = fmtDate(h.check_date);
    return `
      <div class="history-item">
        <div class="history-item-top">
          <span class="history-check">${num} · ${fmt(h.amount)}</span>
          <span class="history-score" style="background:var(--indigo-light);color:var(--indigo);">Approved</span>
        </div>
        <div class="history-meta">${escHtml(h.payee || '—')} · ${date}</div>
        ${h.source_file ? `<div class="history-meta" style="font-size:9px;">${escHtml(h.source_file)}</div>` : ''}
      </div>`;
  }).join('');
}

// ── Event Binding ─────────────────────────────────────────────
function bindEvents() {

  // ── Debug panel ──
  $('#btn-debug').addEventListener('click', () => {
    const p = $('#debug-panel');
    p.style.display = p.style.display === 'none' || !p.style.display ? 'flex' : 'none';
    if (p.style.display !== 'none') p.style.flexDirection = 'column';
  });
  $('#btn-debug-clear').addEventListener('click', () => { $('#debug-log').innerHTML = ''; });

  // ── Auth tab toggle ──
  $$('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.auth;
      $$('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.auth === mode));
      $('#form-login').style.display = mode === 'login' ? '' : 'none';
      $('#form-signup').style.display = mode === 'signup' ? '' : 'none';
      hide('#login-error'); hide('#signup-error'); hide('#signup-success');
    });
  });

  // ── Login ──
  $('#btn-login').addEventListener('click', handleLogin);
  $('#login-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });

  async function handleLogin() {
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    if (!email || !password) return;
    hide('#login-error');
    $('#btn-login').disabled = true;
    showLoading('Signing in...');
    dbg(`Login attempt: ${email}`);
    const res = await sendMsg({ type: 'LOGIN', email, password });
    hideLoading();
    $('#btn-login').disabled = false;
    if (res?.error || !res?.user) {
      const errMsg = res?.error || 'Login failed. Check your credentials.';
      $('#login-error').textContent = errMsg;
      show('#login-error');
      dbg(`Login failed: ${errMsg}`, 'error');
    } else {
      session = res.session || { user: res.user };
      dbg(`Login success: ${res.user?.email}`, 'success');
      setUserChip(res.user?.email, res.user);
      await postLoginFlow();
    }
  }

  // ── Signup ──
  $('#btn-signup').addEventListener('click', handleSignup);
  $('#signup-password').addEventListener('keydown', e => { if (e.key === 'Enter') handleSignup(); });

  async function handleSignup() {
    const company = $('#signup-company').value.trim();
    const email = $('#signup-email').value.trim();
    const password = $('#signup-password').value;
    if (!email || !password) { show('#signup-error'); $('#signup-error').textContent = 'Email and password are required.'; return; }
    if (password.length < 8) { show('#signup-error'); $('#signup-error').textContent = 'Password must be at least 8 characters.'; return; }
    hide('#signup-error'); hide('#signup-success');
    $('#btn-signup').disabled = true;
    showLoading('Creating account...');
    dbg(`Signup attempt: ${email}`);
    const res = await sendMsg({ type: 'SIGNUP', email, password, companyName: company });
    hideLoading();
    $('#btn-signup').disabled = false;
    if (res?.error) {
      $('#signup-error').textContent = res.error;
      show('#signup-error');
      dbg(`Signup failed: ${res.error}`, 'error');
    } else if (res?.needsConfirmation) {
      $('#signup-success').textContent = 'Account created! Check your email to confirm, then sign in.';
      show('#signup-success');
      dbg('Signup: email confirmation required', 'info');
    } else {
      session = res.session || { user: res.user };
      dbg(`Signup + auto-login success: ${res.user?.email}`, 'success');
      setUserChip(res.user?.email, res.user);
      await postLoginFlow();
    }
  }

  // ── Profile panel toggle ──
  const doLogout = async () => {
    dbg('Logout');
    hide('#profile-panel');
    await sendMsg({ type: 'LOGOUT' });
    session = null; matches = []; connections = []; extractedChecks = []; pendingFiles = [];
    hide('#btn-profile');
    showView('auth');
  };
  $('#btn-profile')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = $('#profile-panel');
    if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
  });
  document.addEventListener('click', (e) => {
    const panel = $('#profile-panel');
    if (panel && panel.style.display !== 'none' && !panel.contains(e.target) && e.target.id !== 'btn-profile') {
      panel.style.display = 'none';
    }
  });
  $('#btn-profile-logout')?.addEventListener('click', doLogout);

  // ── Disconnect QB (profile panel) ──
  $('#btn-qb-disconnect')?.addEventListener('click', async () => {
    hide('#profile-panel');
    dbg('Disconnecting QB...');
    showLoading('Disconnecting QuickBooks...');
    const res = await sendMsg({ type: 'DISCONNECT_QB' });
    hideLoading();
    if (res?.error) {
      dbg(`Disconnect QB error: ${res.error}`, 'error');
      return;
    }
    connections = [];
    matches = [];
    dbg('QB disconnected — returning to connect screen', 'info');
    showView('qb-connect');
  });

  // ── Reconnect QB (company bar) ──
  $('#btn-qb-reconnect')?.addEventListener('click', async () => {
    dbg('Reconnect QB: opening OAuth flow');
    const res = await sendMsg({ type: 'OPEN_QB_AUTH' });
    if (res?.success) {
      dbg('QB OAuth tab opened — complete auth and return here', 'success');
    } else {
      dbg(`QB reconnect error: ${res?.error || 'unknown'}`, 'error');
    }
  });

  // ── QB Connect ──
  $('#btn-qb-connect').addEventListener('click', async () => {
    dbg('QB Connect: opening OAuth flow via service worker');
    const res = await sendMsg({ type: 'OPEN_QB_AUTH' });
    dbg(`OPEN_QB_AUTH response: ${JSON.stringify(res)}`);
    if (res?.success) {
      dbg(`QB OAuth tab opened: ${res.url}`, 'success');
      const infoEl = $('#qb-connect-info');
      if (infoEl) { infoEl.textContent = 'QuickBooks opened in a new tab. Authorize, then click "I\'ve Connected" below.'; infoEl.style.display = ''; }
    } else {
      dbg(`QB auth error: ${res?.error || 'no response from service worker'}`, 'error');
      alert(`Could not open QuickBooks: ${res?.error || 'Service worker not responding. Try reloading the extension.'}`);
    }
  });

  $('#btn-qb-connected').addEventListener('click', async () => {
    dbg('QB connected: refreshing connections');
    showLoading('Checking QB connection...');
    const res = await sendMsg({ type: 'GET_CONNECTIONS' });
    connections = res?.connections || [];
    hideLoading();
    dbg(`Connections after refresh: ${connections.length}`);
    if (connections.length > 0) {
      renderCompanySelect();
      showView('main');
      setQbStatus('connected');
      refreshUsageMeter();
      showLoading('Syncing QuickBooks transactions...');
      try { await sendMsg({ type: 'PULL_QB_TXNS' }); } catch (_) {}
      await loadChecksIntoMatches();
      hideLoading();
    } else {
      alert('No QuickBooks companies found yet. Please complete the OAuth flow in the browser tab that opened.');
    }
  });

  $('#btn-qb-skip').addEventListener('click', () => {
    dbg('Skipped QB connect');
    showView('main');
    renderMatches();
  });

  // ── Sort controls ──
  $$('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.sort;
      if (_sortField === field) {
        _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        _sortField = field;
        _sortDir = field === 'date' ? 'desc' : 'asc';
      }
      $$('.sort-btn').forEach(b => b.classList.toggle('active', b.dataset.sort === _sortField));
      const dirBtn = $('#btn-sort-dir');
      if (dirBtn) dirBtn.textContent = _sortDir === 'asc' ? '↑' : '↓';
      renderMatches();
    });
  });
  $('#btn-sort-dir')?.addEventListener('click', () => {
    _sortDir = _sortDir === 'asc' ? 'desc' : 'asc';
    const dirBtn = $('#btn-sort-dir');
    if (dirBtn) dirBtn.textContent = _sortDir === 'asc' ? '↑' : '↓';
    renderMatches();
  });

  // ── Tabs ──
  $$('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

  // Needs Attention chips. Clicking the active one clears it, so the user is
  // never stranded in a filter with no visible way out.
  $$('.attention-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const k = chip.dataset.attention;
      _attentionFilter = (_attentionFilter === k) ? '' : k;
      // A chip is a cross-cutting view, so the status pill goes back to All.
      if (_attentionFilter) {
        currentFilter = 'all';
        $$('.pill').forEach(pl => pl.classList.toggle('active', pl.dataset.status === 'all'));
      }
      renderMatches();
    });
  });

  // Open QuickBooks on the company the user is working on (client item 7).
  // The realm is resolved in the service worker from qb_connections.is_active,
  // not from anything held locally.
  $('#btn-open-qb')?.addEventListener('click', async () => {
    const btn = $('#btn-open-qb');
    if (btn) btn.disabled = true;
    try {
      const acct = getSelectedQbAccount();
      const r = await sendMsg({ type: 'OPEN_QB_COMPANY', accountId: acct?.id || null });
      if (r?.success) dbg(`Opened QuickBooks on realm ${r.realmId}`, 'success');
      else {
        dbg(`OPEN_QB_COMPANY failed: ${r?.error || 'unknown'}`, 'warn');
        showWarningBanner(r?.error || 'Could not open QuickBooks — check the connection.');
      }
    } catch (e) {
      dbg(`OPEN_QB_COMPANY threw: ${e?.message || e}`, 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // ── Filter pills ──
  $$('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      currentFilter = pill.dataset.status;
      $$('.pill').forEach(p => p.classList.toggle('active', p.dataset.status === currentFilter));
      renderMatches();
    });
  });

  // ── Company switch ──
  $('#company-select').addEventListener('change', async (e) => {
    const realmId = e.target.value;
    dbg(`Switch company: ${realmId}`);
    showLoading('Switching company...');
    const switchRes = await sendMsg({ type: 'SWITCH_COMPANY', realmId });
    if (switchRes?.error) {
      hideLoading();
      dbg(`Switch company failed: ${switchRes.error}`, 'error');
      alert(`Company switch failed: ${switchRes.error}`);
      return;
    }
    // Clear all stale cache for previous company
    _cachedDocs = null; _cachedChecks = null; _cachedHistory = null;
    matches = []; extractedChecks = [];
    renderMatches();
    // Pull QB transactions for the new company
    showLoading('Syncing QB data for new company...');
    const pullRes = await sendMsg({ type: 'PULL_QB_TXNS' });
    if (pullRes?.endpointMissing) {
      hideLoading();
      switchTab('matches');
      showQBEndpointMissingBanner(pullRes.error);
      dbg('QB refresh endpoint missing — frontend deploy needed', 'error');
      return;
    }
    if (pullRes?.reconnectNeeded) {
      hideLoading();
      switchTab('matches');
      showQBReconnectBanner(pullRes.error);
      dbg('QB token expired on company switch — reconnect required', 'error');
      return;
    }
    dbg(`QB sync: ${pullRes?.count || 0} txns pulled`);
    // Reload checks and run matching
    showLoading('Loading cheques...');
    const chkRes = await sendMsg({ type: 'GET_CHECKS' });
    if (chkRes?.checks?.length) {
      extractedChecks = chkRes.checks;
      _cachedChecks = chkRes.checks;
      showLoading(`Matching ${extractedChecks.length} cheques...`);
      const matchRes = await sendMsg({ type: 'RUN_MATCHING', checks: extractedChecks });
      if (matchRes?.matches) { matches = matchRes.matches; }
    }
    renderMatches();
    hideLoading();
    dbg(`Company switch complete: ${realmId}`, 'success');
    await autoApproveCleared();
  });

  // ── Sync QB ──
  $('#btn-sync').addEventListener('click', async () => {
    const syncBtn = $('#btn-sync');
    syncBtn.classList.add('spinning');
    dbg('Syncing QB transactions...');
    showLoading('Syncing QB transactions...');
    const pullRes = await sendMsg({ type: 'PULL_QB_TXNS' });
    hideLoading();
    syncBtn.classList.remove('spinning');
    if (pullRes?.endpointMissing) {
      switchTab('matches');
      showQBEndpointMissingBanner(pullRes.error);
      dbg('QB refresh endpoint missing — frontend deploy needed', 'error');
      return;
    }
    if (pullRes?.reconnectNeeded) {
      switchTab('matches');
      showQBReconnectBanner(pullRes.error);
      dbg('QB token expired — reconnect required', 'error');
      return;
    }
    // Invalidate QB Data cache so tab shows fresh results
    _cachedQB = null;
    const syncCount = pullRes?.count || 0;
    const partialErrs = pullRes?.partialErrors || [];
    dbg(`Sync done: ${syncCount} txns`);

    // Show user-visible feedback
    if (syncCount > 0) {
      const errNote = partialErrs.length ? ` (${partialErrs.map(e => `${e.type} failed`).join(', ')})` : '';
      showSuccessBanner(`Synced ${syncCount} QB transactions${errNote}`);
    } else if (partialErrs.length) {
      showWarningBanner(`QB sync: 0 transactions. Errors: ${partialErrs.map(e => `${e.type} ${e.status}`).join(', ')}`);
    } else {
      showWarningBanner('QB sync: 0 transactions found. The connected company may not have check transactions recorded yet.');
    }

    // Refresh QB Data tab if user is currently viewing it (tab id is 'qb', not 'qbdata')
    if (currentTab === 'qb') loadQBTransactions(true);

    // If no checks in memory yet, load from DB first
    if (!extractedChecks.length) {
      showLoading('Loading cheques from database…');
      const chkRes = await sendMsg({ type: 'GET_CHECKS' });
      if (chkRes?.checks?.length) { extractedChecks = chkRes.checks; }
      hideLoading();
    }
    if (extractedChecks.length > 0) {
      showLoading(`Matching ${extractedChecks.length} cheques…`);
      const matchRes = await sendMsg({ type: 'RUN_MATCHING', checks: extractedChecks });
      hideLoading();
      if (matchRes?.matches) {
        matches = matchRes.matches;
        dbg(`Matches: ${matches.length}`, 'success');
      }
    }
    renderMatches();
    await autoApproveCleared();
  });

  // ── Bulk approve ──
  $('#btn-bulk-approve').addEventListener('click', () => {
    const toApprove = matches.filter(m => ['matched', 'pending'].includes(m.status) && m.score >= 95);
    if (toApprove.length === 0) return;
    showBulkApproveConfirm(toApprove.length, async () => {
      let approved = 0, failed = 0, localOnly = 0;

      const results = await runWithLimit(toApprove, 3, m =>
        sendMsg({ type: 'APPROVE_AND_CLEAR', qbTxn: m.qbTxn, check: m.check || null, checkId: m.check?.id, jobId: m.check?.job_id })
          .then(res => ({ m, res }))
          .catch(err => ({ m, res: { success: false, error: err?.message || String(err) } }))
      );

      for (const { m, res } of results) {
        if (res?.success) {
          m.status = 'approved';
          approved++;
          if (res.cleared === false) localOnly++;
        } else {
          failed++;
          dbg(`Bulk approve failed for check ${m.check?.check_number || '?'}: ${res?.error}`, 'error');
        }
      }
      renderMatches();
      const parts = [`${approved} approved`];
      if (localOnly > 0) parts.push(`${localOnly} locally only (no QB link)`);
      if (failed > 0) parts.push(`${failed} failed — see debug log`);
      dbg(`Bulk approve done: ${parts.join(', ')}`, failed > 0 ? 'error' : 'success');
      if (failed > 0) showErrorBanner(`Bulk approve: ${parts.join(', ')}.`);
      else if (approved > 0) showSuccessBanner(`Bulk approve: ${parts.join(', ')}.`);
    });
  });

  // ── Upload zone ──
  const zone = $('#upload-zone');
  const fileInput = $('#file-input');

  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('dragover');
    const newFiles = Array.from(e.dataTransfer.files);
    pendingFiles = [...pendingFiles, ...newFiles];
    renderFileQueue();
  });
  fileInput.addEventListener('change', e => {
    const newFiles = Array.from(e.target.files);
    pendingFiles = [...pendingFiles, ...newFiles];
    renderFileQueue();
    fileInput.value = '';
  });
  $('#btn-browse').addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });

  // ── Next: Configure ──
  $('#btn-next-configure').addEventListener('click', () => setUploadStep(2));
  $('#btn-back-upload').addEventListener('click', () => setUploadStep(1));

  // ── Method selection ──
  $$('.method-card').forEach(card => {
    card.addEventListener('click', () => {
      selectedMethod = card.dataset.method;
      $$('.method-card').forEach(c => c.classList.toggle('active', c.dataset.method === selectedMethod));
      dbg(`Extraction method: ${selectedMethod}`);
    });
  });

  // ── Start extraction ──
  $('#btn-start-extract').addEventListener('click', () => runExtraction());

  // ── Match extracted ──
  $('#btn-match-extracted').addEventListener('click', async () => {
    if (!extractedChecks.length) return;
    showLoading('Pulling QB transactions...');
    dbg('Matching extracted checks against QB');
    await sendMsg({ type: 'PULL_QB_TXNS' });
    showLoading('Running matching algorithm...');
    const res = await sendMsg({ type: 'RUN_MATCHING', checks: extractedChecks });
    hideLoading();
    if (res?.matches) {
      matches = res.matches;
      dbg(`Matches: ${matches.length}`, 'success');
      switchTab('matches');
      renderMatches();
      await autoApproveCleared();
    }
  });

  // ── Upload more ──
  $('#btn-upload-more').addEventListener('click', () => {
    pendingFiles = []; extractedChecks = []; currentJobId = null;
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    renderFileQueue(); hide('#extraction-results');
    setUploadStep(1);
  });

  // ── Load & match from DB ──
  $('#btn-load-match')?.addEventListener('click', () => loadChecksIntoMatches());

  // ── Matches filter toggle + events ──
  $('#btn-match-filter-toggle')?.addEventListener('click', () => {
    const bar = $('#matches-filter-bar');
    if (!bar) return;
    const visible = bar.style.display !== 'none';
    bar.style.display = visible ? 'none' : '';
    const btn = $('#btn-match-filter-toggle');
    if (btn) btn.classList.toggle('active', !visible);
  });
  const applyMatchFilter = () => renderMatches();
  $('#match-search')?.addEventListener('input', e => {
    _matchSearch = e.target.value.trim();
    const clr = $('#match-search-clear');
    if (clr) clr.style.display = _matchSearch ? '' : 'none';
    applyMatchFilter();
  });
  $('#match-search-clear')?.addEventListener('click', () => {
    _matchSearch = '';
    const inp = $('#match-search'); if (inp) inp.value = '';
    const clr = $('#match-search-clear'); if (clr) clr.style.display = 'none';
    applyMatchFilter();
  });
  $('#match-date-from')?.addEventListener('change', e => { _matchDateFrom = e.target.value || null; applyMatchFilter(); });
  $('#match-date-to')?.addEventListener('change',   e => { _matchDateTo   = e.target.value || null; applyMatchFilter(); });
  $('#match-date-clear')?.addEventListener('click', () => {
    _matchDateFrom = null; _matchDateTo = null;
    const f = $('#match-date-from'); if (f) f.value = '';
    const t = $('#match-date-to');   if (t) t.value = '';
    applyMatchFilter();
  });

  // ── QB Data tab: refresh + search + date filter events ──
  $('#btn-refresh-qb')?.addEventListener('click', () => { _cachedQB = null; loadQBTransactions(true); });
  const applyQBFilter = () => { if (_cachedQB !== null) renderQBList(_cachedQB); };
  $('#qb-search')?.addEventListener('input', e => {
    _qbSearch = e.target.value.trim();
    const clr = $('#qb-search-clear');
    if (clr) clr.style.display = _qbSearch ? '' : 'none';
    applyQBFilter();
  });
  $('#qb-search-clear')?.addEventListener('click', () => {
    _qbSearch = '';
    const inp = $('#qb-search'); if (inp) inp.value = '';
    const clr = $('#qb-search-clear'); if (clr) clr.style.display = 'none';
    applyQBFilter();
  });
  $('#qb-date-from')?.addEventListener('change', e => { _qbDateFrom = e.target.value || null; applyQBFilter(); });
  $('#qb-date-to')?.addEventListener('change',   e => { _qbDateTo   = e.target.value || null; applyQBFilter(); });
  $('#qb-date-clear')?.addEventListener('click', () => {
    _qbDateFrom = null; _qbDateTo = null;
    const f = $('#qb-date-from'); if (f) f.value = '';
    const t = $('#qb-date-to');   if (t) t.value = '';
    applyQBFilter();
  });

  // ── Checks search + date filter events ──
  const applyChecksFilter = () => {
    if (_cachedChecks !== null) renderChecksList(_cachedChecks);
  };
  $('#checks-search')?.addEventListener('input', e => {
    _checksSearch = e.target.value.trim();
    const clearBtn = $('#checks-search-clear');
    if (clearBtn) clearBtn.style.display = _checksSearch ? '' : 'none';
    applyChecksFilter();
  });
  $('#checks-search-clear')?.addEventListener('click', () => {
    _checksSearch = '';
    const inp = $('#checks-search');
    if (inp) inp.value = '';
    $('#checks-search-clear').style.display = 'none';
    applyChecksFilter();
  });
  $('#checks-date-from')?.addEventListener('change', e => { _checksDateFrom = e.target.value || null; applyChecksFilter(); });
  $('#checks-date-to')?.addEventListener('change',   e => { _checksDateTo   = e.target.value || null; applyChecksFilter(); });
  $('#checks-date-clear')?.addEventListener('click', () => {
    _checksDateFrom = null; _checksDateTo = null;
    const f = $('#checks-date-from'); if (f) f.value = '';
    const t = $('#checks-date-to');   if (t) t.value = '';
    applyChecksFilter();
  });

  // ── Review modal events ──
  $('#rm-close')?.addEventListener('click', () => hide('#review-modal'));
  $('#review-modal')?.addEventListener('click', e => { if (e.target === $('#review-modal')) hide('#review-modal'); });
  const reviewAction = async (status) => {
    if (!_reviewCheck) return;
    const btn = status === 'approved' ? $('#rm-approve') : status === 'rejected' ? $('#rm-reject') : $('#rm-undo');
    if (btn) { btn.disabled = true; btn.textContent = 'Updating…'; }

    // For "approved" — if there is a linked QB txn, route through the full
    // APPROVE_AND_CLEAR flow so it broadcasts KYRIQ_APPROVAL_ADDED and ticks
    // the cleared checkbox on whatever QB tab is open.
    if (status === 'approved' && _reviewMatch?.qbTxn) {
      hide('#review-modal');
      const matchIdx = matches.findIndex(m => m === _reviewMatch);
      if (matchIdx !== -1) {
        if (btn) { btn.disabled = false; btn.textContent = '✅ Approve'; }
        await approveAndClear(matchIdx);
        // Sync checks list cache so the check shows as approved.
        if (_cachedChecks) {
          const ci = _cachedChecks.findIndex(c => c.id === _reviewCheck.id);
          if (ci !== -1) { _cachedChecks[ci].status = 'approved'; }
        }
        renderChecksList(_cachedChecks || []);
        _cachedHistory = null;
        return;
      }
    }

    // Fallback: no qbTxn, or rejected/undo — update Supabase status only.
    const undoStatus = status === 'pending_review' ? status : null;
    const newStatus = undoStatus || status;
    const res = await sendMsg({ type: 'UPDATE_CHECK_STATUS', checkId: _reviewCheck.id, jobId: _reviewCheck.job_id, status: newStatus });
    if (res?.success) {
      if (_cachedChecks) {
        const idx = _cachedChecks.findIndex(c => c.id === _reviewCheck.id);
        if (idx !== -1) { _cachedChecks[idx].status = newStatus; }
      }
      _reviewCheck.status = newStatus;
      hide('#review-modal');
      renderChecksList(_cachedChecks || []);
      if (status === 'approved') { _cachedHistory = null; }
    } else {
      const origLabel = status === 'approved' ? '✅ Approve' : status === 'rejected' ? '❌ Reject' : '↩ Undo';
      if (btn) {
        btn.disabled = false;
        btn.textContent = '⚠ ' + (res?.error || 'Failed');
        setTimeout(() => { btn.textContent = origLabel; }, 3000);
      }
      dbg(`reviewAction ${status} failed: ${res?.error}`, 'error');
    }
  };
  $('#rm-approve')?.addEventListener('click', () => reviewAction('approved'));
  $('#rm-reject')?.addEventListener('click',  () => reviewAction('rejected'));
  $('#rm-undo')?.addEventListener('click', async () => {
    if (!_reviewCheck) return;
    const m = matches.find(x => x.check?.id === _reviewCheck.id);
    const intuitId = m?.qbTxn?.intuit_id;
    if (intuitId) {
      try {
        await sendMsg({
          type: 'UNDO_QB_TICK',
          intuitId,
          checkId:   _reviewCheck.id,
          txnType:   m.qbTxn.txn_type   || null,
          docNumber: m.qbTxn.doc_number || null,
          amount:    m.qbTxn.amount     || null,
          payee:     m.qbTxn.payee      || null,
          account:   m.qbTxn.account    || null,
        });
      } catch (e) {
        dbg(`Undo QB untick failed (continuing with status revert): ${e?.message || e}`, 'error');
      }
    }
    reviewAction('pending_review');
  });

  // "Fix All Discrepancies" — copy extracted values to QB fields for any diff, then save
  $('#rm-fix-all')?.addEventListener('click', () => {
    const m = $('#review-modal');
    if (!m) return;
    const fields = [
      { ext: '#rmi-amount',  qb: '#rmq-amount',  diff: '#rmd-amount'  },
      { ext: '#rmi-date',    qb: '#rmq-date',     diff: '#rmd-date'    },
      { ext: '#rmi-payee',   qb: '#rmq-payee',    diff: '#rmd-payee'   },
      { ext: '#rmi-checknum',qb: '#rmq-checknum', diff: '#rmd-checknum'},
    ];
    let fixed = 0;
    for (const f of fields) {
      const diffEl = m.querySelector(f.diff);
      const isDiff = diffEl?.classList.contains('diff');
      if (!isDiff) continue;
      const extVal = m.querySelector(f.ext)?.value.trim();
      const qbEl   = m.querySelector(f.qb);
      if (extVal && qbEl) { qbEl.value = extVal; qbEl.dispatchEvent(new Event('input', { bubbles: true })); fixed++; }
    }
    if (fixed === 0) { showSuccessBanner('No discrepancies to fix.'); return; }
    updateModalDiffs(m);
    // Auto-save after filling
    $('#rm-save')?.click();
  });

  $('#rm-save')?.addEventListener('click', async () => {
    if (!_reviewCheck) return;
    const btn = $('#rm-save');
    const fb  = $('#rm-save-feedback');
    btn.disabled = true; btn.textContent = 'Saving…';

    const checkFields = {
      amount:       parseFloat($('#rmi-amount').value.replace(/[^0-9.-]/g, '')) || null,
      check_date:   toISODate($('#rmi-date').value.trim()) || $('#rmi-date').value.trim() || null,
      payee:        $('#rmi-payee').value.trim() || null,
      check_number: $('#rmi-checknum').value.trim() || null,
    };
    const qbFields = {
      amount:     parseFloat($('#rmq-amount').value.replace(/[^0-9.-]/g, '')) || null,
      txn_date:   toISODate($('#rmq-date').value.trim()) || null,
      payee:      $('#rmq-payee').value.trim() || null,
      doc_number: $('#rmq-checknum').value.trim() || null,
    };

    // Save extracted check fields
    let qbSavePromise = Promise.resolve({ success: true });
    if (_reviewMatch?.qbTxn) {
      const qt = _reviewMatch.qbTxn;
      let qbIntuitId = null;
      if (qt.txn_id) {
        const parts = String(qt.txn_id).split('-');
        qbIntuitId = parts.slice(1).join('-') || null;
      }
      qbSavePromise = sendMsg({
        type: 'SAVE_QB_TXN',
        txnId: qt.id,
        txnType: qt.txn_type || null,
        qbIntuitId,
        fields: qbFields,
      });
    }
    const [checkRes, qbRes] = await Promise.all([
      sendMsg({ type: 'UPDATE_CHECK_FIELDS', checkId: _reviewCheck.id, jobId: _reviewCheck.job_id, fields: checkFields }),
      qbSavePromise,
    ]);

    btn.disabled = false; btn.textContent = '💾 Save Changes';
    const checkOk = !!checkRes?.success;
    const qbOk   = !!qbRes?.success;
    const qbWarn = qbRes?.qbWarning || null;

    if (checkOk) {
      // At least the check fields saved — update memory caches
      Object.assign(_reviewCheck, checkFields);
      if (_cachedChecks) {
        const idx = _cachedChecks.findIndex(c => c.id === _reviewCheck.id);
        if (idx !== -1) Object.assign(_cachedChecks[idx], checkFields);
      }
      if (_reviewMatch?.check) Object.assign(_reviewMatch.check, checkFields);
      if (qbOk && _reviewMatch?.qbTxn) Object.assign(_reviewMatch.qbTxn, { amount: qbFields.amount, txn_date: qbFields.txn_date, payee: qbFields.payee, doc_number: qbFields.doc_number });

      if (fb) {
        if (qbWarn) {
          fb.textContent = `✓ Check saved — QB update skipped`;
          fb.className = 'rm-save-feedback warn';
          showErrorDialog('Save to QB Failed', qbWarn, qbRes?.qbRaw || null);
        } else if (!qbOk && _reviewMatch?.qbTxn) {
          fb.textContent = `✓ Check saved — QB push failed`;
          fb.className = 'rm-save-feedback warn';
          showErrorDialog('Save to QB Failed', qbRes?.error || 'Unknown error', qbRes?.qbRaw || null);
        } else {
          fb.textContent = '✓ Saved successfully';
          fb.className = 'rm-save-feedback ok';
        }
        fb.style.display = '';
        if (!qbWarn && qbOk) setTimeout(() => { fb.style.display = 'none'; }, 2500);
      }
    } else {
      const err = checkRes?.error || 'Save failed';
      if (fb) { fb.textContent = err; fb.className = 'rm-save-feedback err'; fb.style.display = ''; }
    }
  });

  // ── Refresh docs / checks / history (force=true) ──
  $('#btn-refresh-docs').addEventListener('click', () => { _cachedDocs = null; loadDocuments(true); });
  $('#btn-refresh-checks').addEventListener('click', () => {
    _cachedChecks = null;
    loadChecks(true).then(() => {
      if (_cachedDocs?.length) populateDocFilter(_cachedDocs);
    });
  });
  $('#btn-refresh-history').addEventListener('click', () => { _cachedHistory = null; loadHistory(true); });

  // ── Doc filter (Matches tab) ──
  $('#doc-filter')?.addEventListener('change', e => {
    _docFilter = e.target.value;
    renderMatches();
  });

  // ── Doc filter (Cheques tab) ──
  $('#cheques-doc-filter')?.addEventListener('change', e => {
    _chequeDocFilter = e.target.value;
    if (_cachedChecks !== null) renderChecksList(_cachedChecks);
  });

  // ── Account filter (company bar) ──
  $('#account-select')?.addEventListener('change', e => {
    _accountFilter = e.target.value;
    renderMatches();
    if (_cachedQB !== null) renderQBList(_cachedQB);
  });

  // ── Match source filter (Matches tab) ──
  $('#match-source-filter')?.addEventListener('change', e => {
    _matchSourceFilter = e.target.value;
    renderMatches();
  });

  // ── QB source type pills (QB Data tab) ──
  $$('.src-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      _qbSourceFilter = pill.dataset.src;
      $$('.src-pill').forEach(p => p.classList.toggle('active', p.dataset.src === _qbSourceFilter));
      if (_cachedQB !== null) renderQBList(_cachedQB);
    });
  });

  // ── Date format selector (profile panel) ──
  $('#date-format-select')?.addEventListener('change', e => {
    saveDateFormat(e.target.value);
  });

  // ── Overlay visibility radio group (profile panel) ──
  document.querySelectorAll('input[name="overlay-mode"]').forEach(r => {
    r.addEventListener('change', e => {
      if (e.target.checked) saveOverlayModeSetting(e.target.value);
    });
  });
}


// ═══════════════════════════════════════════════════════════════════════════
// Header: QuickBooks status + usage meter
// Parity with the app's top bar (CHECKLIST 11). Both are read-only reporting;
// neither gates anything here, because the gate lives server-side.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {'connected'|'stale'|'off'} state
 * @param {string} [label] overrides the default copy
 */
function setQbStatus(state, label) {
  const el = $('#qb-status');
  if (!el) return;
  el.classList.toggle('is-stale', state === 'stale');
  el.classList.toggle('is-off', state === 'off');
  el.textContent = label || (
    state === 'connected' ? 'QuickBooks connected' :
    state === 'stale'     ? 'Reconnect QuickBooks' :
                            'Not connected'
  );
  el.title = el.textContent;
}

/**
 * Reads /api/usage/trial-status through the service worker -- the same endpoint
 * the app's trial meter reads, so the panel and the processing gate cannot
 * report different numbers. Stays hidden when the figure is unknown rather
 * than showing a made-up allowance.
 */
async function refreshUsageMeter() {
  const wrap = $('#usage-meter');
  if (!wrap) return;
  let usage = null;
  try {
    const res = await sendMsg({ type: 'GET_USAGE' });
    usage = res?.usage || null;
    if (res?.error) dbg(`Usage fetch: ${res.error}`, 'warn');
  } catch (e) {
    dbg(`Usage fetch threw: ${e?.message || e}`, 'warn');
  }
  if (!usage) { wrap.style.display = 'none'; return; }

  const used = Number(usage.checksUsedThisPeriod ?? usage.trialChecksUsed ?? 0);
  const limitRaw = usage.planCheckAllowance ?? usage.trialCheckLimit ?? null;
  const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : null;

  const valEl = $('#usage-meter-val');
  const fill  = $('#usage-meter-fill');
  if (limit && limit > 0) {
    const pct = Math.min(100, Math.round((used / limit) * 100));
    if (valEl) valEl.textContent = `${used.toLocaleString()} / ${limit.toLocaleString()}`;
    if (fill) fill.style.width = `${pct}%`;
    wrap.classList.toggle('is-warn', pct >= 80 && pct < 100);
    wrap.classList.toggle('is-over', pct >= 100);
    const days = usage.daysRemaining;
    wrap.title = Number.isFinite(Number(days))
      ? `${used} of ${limit} checks this period · ${days} day(s) left`
      : `${used} of ${limit} checks this period`;
  } else {
    // Unlimited plan: report the count, do not draw a meter against nothing.
    if (valEl) valEl.textContent = `${used.toLocaleString()} used`;
    if (fill) fill.style.width = '0%';
    wrap.classList.remove('is-warn', 'is-over');
    wrap.title = `${used} checks this period`;
  }
  wrap.style.display = '';
}
