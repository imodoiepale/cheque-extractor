/**
 * Kyriq — Popup Controller
 * Drives the entire extension UI: login, company switching, upload, matching, approve+clear
 */

// ── Helpers ──────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function show(id) { $(id).style.display = ''; }
function hide(id) { $(id).style.display = 'none'; }
function showLoading(text = 'Loading...') { $('#loading-text').textContent = text; show('#loading'); }
function hideLoading() { hide('#loading'); }

function fmt(amount) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function sendMsg(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
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

// ── State ────────────────────────────────────────────────────
let currentView = 'login';
let currentTab = 'matches';
let currentFilter = 'all';
let matches = [];
let extractedChecks = [];
let connections = [];
let session = null;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const res = await sendMsg({ type: 'GET_SESSION' });
  session = res?.session;

  if (session) {
    await loadMainView();
  } else {
    showView('login');
  }

  bindEvents();
});

// ── View Management ──────────────────────────────────────────
function showView(view) {
  currentView = view;
  $$('.view').forEach(v => v.style.display = 'none');

  if (view === 'login') {
    show('#view-login');
    hide('#company-bar');
    hide('#tabs');
  } else if (view === 'settings') {
    show('#view-settings');
    hide('#company-bar');
    hide('#tabs');
    loadSettings();
  } else if (view === 'main') {
    show('#company-bar');
    show('#tabs');
    switchTab(currentTab);
  }
}

function switchTab(tab) {
  currentTab = tab;
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  $$('.view').forEach(v => v.style.display = 'none');

  if (tab === 'matches') show('#view-matches');
  else if (tab === 'upload') show('#view-upload');
  else if (tab === 'history') show('#view-history');
}

// ── Load Main View ───────────────────────────────────────────
async function loadMainView() {
  showLoading('Loading companies...');
  try {
    const res = await sendMsg({ type: 'GET_CONNECTIONS' });
    connections = res?.connections || [];
    renderCompanySelect();
    showView('main');
    await loadMatches();
  } catch (e) {
    console.error(e);
  } finally {
    hideLoading();
  }
}

function renderCompanySelect() {
  const sel = $('#company-select');
  sel.innerHTML = '';
  if (connections.length === 0) {
    sel.innerHTML = '<option>No QB companies connected</option>';
    return;
  }
  connections.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.realm_id;
    opt.textContent = c.company_name || `Realm ${c.realm_id}`;
    opt.selected = c.is_active;
    sel.appendChild(opt);
  });
}

// ── Matches ──────────────────────────────────────────────────
async function loadMatches() {
  // For the extension, matches are stored in memory after a sync+match cycle
  // We show whatever we have from the last match run
  renderMatches();
}

function renderMatches() {
  const list = $('#match-list');
  const filtered = currentFilter === 'all' ? matches : matches.filter(m => m.status === currentFilter);

  // Update counts
  const counts = { all: matches.length };
  matches.forEach(m => { counts[m.status] = (counts[m.status] || 0) + 1; });
  ['all', 'pending', 'matched', 'discrepancy', 'unmatched', 'approved'].forEach(k => {
    const el = $(`#cnt-${k}`);
    if (el) el.textContent = counts[k] || 0;
  });

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <p>No matches yet</p>
        <p class="sub">Upload checks & sync QB to start matching</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered.map((m, i) => renderMatchRow(m, i)).join('');
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
          <div class="num">#${check.check_number || '—'}  ${fmt(check.amount)}</div>
          <div class="detail">${fmtDate(check.check_date)} · ${check.payee || 'No payee'}</div>
        </div>
        <div class="match-score">
          <div class="score ${sc}">${Math.round(m.score)}%</div>
          <div class="status">${m.status}</div>
        </div>
        <div class="match-qb">
          ${hasTxn ? `
            <div class="num">${txn.doc_number ? '#' + txn.doc_number : txn.txn_type || 'Txn'}  ${fmt(txn.amount)}</div>
            <div class="detail">${fmtDate(txn.txn_date)} · ${txn.payee || 'No payee'}</div>
          ` : `<div class="no-match">❓ No QB match</div>`}
        </div>
      </div>
      <div class="match-actions">
        ${m.status === 'unmatched' ? `
          <button class="btn-sm btn-ghost" data-action="search" data-idx="${index}">🔍 Find</button>
        ` : ''}
        ${['matched', 'pending', 'discrepancy'].includes(m.status) ? `
          <button class="btn-sm btn-green" data-action="approve" data-idx="${index}">✅ Approve & Clear</button>
        ` : ''}
        ${m.status === 'approved' ? `
          <button class="btn-sm btn-ghost" data-action="undo" data-idx="${index}">↩️ Undo</button>
        ` : ''}
        ${m.status !== 'approved' ? `
          <button class="btn-sm btn-ghost" data-action="flag" data-idx="${index}">🚩</button>
        ` : ''}
      </div>
      <div class="match-detail" id="detail-${index}">
        ${m.reasons ? `
          <div class="score-breakdown">
            ${scoreItem('Amount', m.reasons.amount || 0, 40)}
            ${scoreItem('Check #', m.reasons.checkNumber || 0, 30)}
            ${scoreItem('Date', m.reasons.date || 0, 15)}
            ${scoreItem('Payee', m.reasons.payee || 0, 15)}
          </div>
        ` : ''}
        ${m.amtDiff > 0.01 ? `<p style="font-size:10px;color:#dc2626;margin-top:6px;">⚠️ Amount difference: ${fmt(m.amtDiff)}</p>` : ''}
      </div>
    </div>`;
}

function scoreItem(label, score, max) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  return `
    <div class="score-item">
      <div class="lbl">${label}</div>
      <div class="score-bar"><div class="score-bar-fill ${barColor(pct)}" style="width:${pct}%"></div></div>
      <div class="val">${score}/${max}</div>
    </div>`;
}

function bindMatchEvents() {
  // Toggle detail
  $$('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const detail = $(`#detail-${el.dataset.toggle}`);
      detail?.classList.toggle('open');
    });
  });

  // Actions
  $$('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      const action = btn.dataset.action;
      const match = matches[idx];
      if (!match) return;

      if (action === 'approve') {
        await approveAndClear(idx);
      } else if (action === 'undo') {
        match.status = match.score >= 95 ? 'matched' : 'pending';
        renderMatches();
      } else if (action === 'flag') {
        match.status = 'flagged';
        renderMatches();
      } else if (action === 'search') {
        // Simple search prompt
        const query = prompt('Search QB transactions:', match.check?.payee || '');
        if (!query) return;
        showLoading('Searching QB...');
        const res = await sendMsg({ type: 'SEARCH_QB', query });
        hideLoading();
        if (res?.results?.length) {
          const txn = res.results[0]; // Auto-pick best for now
          match.qbTxn = txn;
          match.status = 'pending';
          match.score = 50; // Will re-score properly
          renderMatches();
        } else {
          alert('No QB transactions found for: ' + query);
        }
      }
    });
  });
}

async function approveAndClear(idx) {
  const match = matches[idx];
  if (!match) return;

  showLoading('Approving & clearing in QB...');
  try {
    if (match.qbTxn) {
      const res = await sendMsg({
        type: 'APPROVE_AND_CLEAR',
        qbTxn: match.qbTxn,
      });
      if (res?.error) {
        alert('QB Clear failed: ' + res.error);
        hideLoading();
        return;
      }
    }
    match.status = 'approved';
    renderMatches();
  } finally {
    hideLoading();
  }
}

// ── Upload & OCR ─────────────────────────────────────────────
function handleFiles(files) {
  if (!files.length) return;
  extractedChecks = [];

  let completed = 0;
  const total = files.length;

  const processFile = async (file) => {
    try {
      const base64 = await fileToBase64(file);
      const res = await sendMsg({
        type: 'EXTRACT_CHECK',
        imageBase64: base64,
        mimeType: file.type || 'image/png',
      });
      if (res?.success) {
        extractedChecks.push({ ...res.data, _fileName: file.name });
        completed++;
        showLoading(`🤖 Extracting checks... ${completed}/${total} complete`);
      } else {
        console.error('OCR failed:', res?.error);
        completed++;
        showLoading(`⚠️ Processing... ${completed}/${total} (1 failed)`);
      }
    } catch (e) {
      console.error('Extract error:', e);
      completed++;
      showLoading(`⚠️ Processing... ${completed}/${total} (1 error)`);
    }
  };

  (async () => {
    // Process all files in parallel for blazing fast extraction
    showLoading(`🚀 Extracting ${total} check(s) in parallel...`);
    await Promise.all(Array.from(files).map(file => processFile(file)));
    hideLoading();
    renderExtracted();
  })();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function renderExtracted() {
  if (extractedChecks.length === 0) {
    hide('#extraction-results');
    return;
  }

  show('#extraction-results');
  const list = $('#extracted-list');
  list.innerHTML = extractedChecks.map(c => `
    <div class="extracted-card">
      <div class="field"><span class="label">File</span><span class="value">${c._fileName}</span></div>
      <div class="field"><span class="label">Check #</span><span class="value">${c.check_number || '—'}</span></div>
      <div class="field"><span class="label">Amount</span><span class="value">${fmt(c.amount)}</span></div>
      <div class="field"><span class="label">Date</span><span class="value">${c.check_date || '—'}</span></div>
      <div class="field"><span class="label">Payee</span><span class="value">${c.payee || '—'}</span></div>
      ${c.memo ? `<div class="field"><span class="label">Memo</span><span class="value">${c.memo}</span></div>` : ''}
    </div>
  `).join('');
}

// ── Settings ─────────────────────────────────────────────────
async function loadSettings() {
  const cfg = await sendMsg({ type: 'GET_CONFIG' });
  $('#cfg-supabase-url').value = cfg?.supabaseUrl || '';
  $('#cfg-supabase-key').value = cfg?.supabaseAnonKey || '';
  $('#cfg-qb-client-id').value = cfg?.qbClientId || '';
  $('#cfg-qb-secret').value = cfg?.qbClientSecret || '';
  $('#cfg-gemini-key').value = cfg?.geminiApiKey || '';

  if (session) {
    show('#user-info');
    $('#user-email').textContent = session.user?.email || '';
  } else {
    hide('#user-info');
  }
}

// ── Event Binding ────────────────────────────────────────────
function bindEvents() {
  // Login
  $('#btn-login').addEventListener('click', async () => {
    const email = $('#login-email').value.trim();
    const password = $('#login-password').value;
    if (!email || !password) return;

    hide('#login-error');
    showLoading('Logging in...');
    const res = await sendMsg({ type: 'LOGIN', email, password });
    hideLoading();

    if (res?.error) {
      $('#login-error').textContent = res.error;
      show('#login-error');
    } else {
      session = { user: res.user, access_token: res.access_token };
      await loadMainView();
    }
  });

  // Enter key on password
  $('#login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#btn-login').click();
  });

  // Settings
  $('#btn-settings').addEventListener('click', () => showView('settings'));
  $('#btn-show-settings').addEventListener('click', (e) => { e.preventDefault(); showView('settings'); });
  $('#btn-back').addEventListener('click', () => {
    if (session) loadMainView();
    else showView('login');
  });

  $('#btn-save-settings').addEventListener('click', async () => {
    const config = {
      supabaseUrl: $('#cfg-supabase-url').value.trim().replace(/\/$/, ''),
      supabaseAnonKey: $('#cfg-supabase-key').value.trim(),
      qbClientId: $('#cfg-qb-client-id').value.trim(),
      qbClientSecret: $('#cfg-qb-secret').value.trim(),
      geminiApiKey: $('#cfg-gemini-key').value.trim(),
    };
    await sendMsg({ type: 'SAVE_CONFIG', config });
    show('#settings-msg');
    setTimeout(() => hide('#settings-msg'), 2500);
  });

  // Logout
  $('#btn-logout').addEventListener('click', async () => {
    await sendMsg({ type: 'LOGOUT' });
    session = null;
    matches = [];
    connections = [];
    showView('login');
  });

  // Tabs
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Filter pills
  $$('.pill').forEach(pill => {
    pill.addEventListener('click', () => {
      currentFilter = pill.dataset.status;
      $$('.pill').forEach(p => p.classList.toggle('active', p.dataset.status === currentFilter));
      renderMatches();
    });
  });

  // Company switch
  $('#company-select').addEventListener('change', async (e) => {
    showLoading('Switching company...');
    await sendMsg({ type: 'SWITCH_COMPANY', realmId: e.target.value });
    matches = [];
    renderMatches();
    hideLoading();
  });

  // Sync QB
  $('#btn-sync').addEventListener('click', async () => {
    showLoading('Syncing QB transactions...');
    const pullRes = await sendMsg({ type: 'PULL_QB_TXNS' });
    showLoading(`Synced ${pullRes?.count || 0} txns. Running match...`);

    // If we have extracted checks, match against QB
    if (extractedChecks.length > 0) {
      const matchRes = await sendMsg({ type: 'RUN_MATCHING', checks: extractedChecks });
      if (matchRes?.matches) {
        matches = matchRes.matches;
      }
    }
    renderMatches();
    hideLoading();
  });

  // Bulk approve
  $('#btn-bulk-approve').addEventListener('click', async () => {
    let approved = 0;
    matches.forEach(m => {
      if (['matched', 'pending'].includes(m.status) && m.score >= 95) {
        m.status = 'approved';
        approved++;
        // Fire and forget the QB clear
        if (m.qbTxn) sendMsg({ type: 'APPROVE_AND_CLEAR', qbTxn: m.qbTxn });
      }
    });
    renderMatches();
    if (approved > 0) alert(`✅ Auto-approved & cleared ${approved} matches in QB`);
    else alert('No matches with ≥95% confidence to auto-approve');
  });

  // Upload
  const uploadZone = $('#upload-zone');
  const fileInput = $('#file-input');

  uploadZone.addEventListener('click', () => fileInput.click());
  uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

  // Match extracted checks
  $('#btn-match-extracted').addEventListener('click', async () => {
    if (extractedChecks.length === 0) return;
    showLoading('Matching against QB...');

    // Pull fresh QB data first
    await sendMsg({ type: 'PULL_QB_TXNS' });

    const res = await sendMsg({ type: 'RUN_MATCHING', checks: extractedChecks });
    if (res?.matches) {
      matches = res.matches;
      switchTab('matches');
    }
    hideLoading();
    renderMatches();
  });
}
