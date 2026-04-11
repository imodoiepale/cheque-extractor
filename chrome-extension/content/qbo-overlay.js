/**
 * Kyriq — QBO Content Script
 *
 * Three active integrations with QB Online pages:
 *
 * 1. RECONCILIATION PAGE  (/app/reconcile)
 *    Injects an "Auto-Clear Kyriq Approved" button.
 *    Finds every transaction row whose intuit_id or check_number matches a
 *    Kyriq-approved transaction, then clicks its cleared checkbox.
 *    Solves the Purchase ClearStatus API limitation entirely — the UI can
 *    set it even when the IDS API cannot.
 *
 * 2. BANK FEED / REGISTER  (/app/banking, /app/register)
 *    Injects a "Kyriq ✓" badge on rows whose txnId matches an approved txn.
 *
 * 3. TRANSACTION DETAIL  (/app/expense, /app/check, /app/billpayment, /app/payment)
 *    Injects a status banner at the top of the page showing Kyriq approval state.
 *
 * All three read from the service worker via GET_KYRIQ_APPROVED which merges
 * locally stored approvals with any approved checks found in Supabase.
 */

(function () {
  'use strict';

  if (window.__kyriqInjected) return;
  window.__kyriqInjected = true;

  // ─── Utilities ────────────────────────────────────────────────

  function log(...args)  { console.log('[Kyriq]', ...args); }
  function warn(...args) { console.warn('[Kyriq]', ...args); }

  /** Wait for an element matching `selector` to appear in the DOM. */
  function waitForEl(selector, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      const obs = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { obs.disconnect(); resolve(found); }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { obs.disconnect(); reject(new Error(`Timeout waiting for ${selector}`)); }, timeoutMs);
    });
  }

  /** Normalise a check number: strip leading zeros, trim whitespace. */
  function normNum(s) { return String(s || '').trim().replace(/^0+/, ''); }

  /** Normalise an amount to a 2-dp string for comparison. */
  function normAmt(n) {
    const v = parseFloat(String(n || '').replace(/[^0-9.-]/g, ''));
    return isNaN(v) ? null : Math.abs(v).toFixed(2);
  }

  /**
   * Extract intuit_id from a link href containing ?txnId= or &txnId=
   * QB transaction links look like: /app/expense?txnId=19 or /app/check?txnId=42
   */
  function txnIdFromHref(href) {
    if (!href) return null;
    const m = href.match(/[?&]txnId=(\d+)/i);
    return m ? m[1] : null;
  }

  // ─── Page detection ───────────────────────────────────────────

  function getPageType() {
    const p = location.pathname + location.search;
    if (/\/reconcile/i.test(p))                                              return 'reconcile';
    if (/\/banking|\/bank-transactions|\/register/i.test(p))                 return 'bankfeed';
    if (/\/expense|\/check|\/billpayment|\/payment|\/deposit/i.test(p))      return 'txndetail';
    return 'other';
  }

  // ─── Service-worker bridge ────────────────────────────────────

  let _approvedCache = null;
  let _approvedFetchedAt = 0;

  async function getApproved(forceRefresh = false) {
    const AGE = 60_000; // re-fetch after 60 s
    if (!forceRefresh && _approvedCache && Date.now() - _approvedFetchedAt < AGE) {
      return _approvedCache;
    }
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_KYRIQ_APPROVED' });
      const list = res?.approved || [];
      _approvedCache = buildLookup(list);
      _approvedFetchedAt = Date.now();
      return _approvedCache;
    } catch (e) {
      warn('GET_KYRIQ_APPROVED failed', e);
      return _approvedCache || { byId: {}, byNum: {}, byAmt: {}, list: [] };
    }
  }

  function buildLookup(list) {
    const byId  = {};
    const byNum = {};
    const byAmt = {};
    for (const t of list) {
      if (t.intuit_id)  byId[String(t.intuit_id)]             = t;
      if (t.doc_number) byNum[normNum(t.doc_number)]           = t;
      if (t.amount) {
        const k = normAmt(t.amount);
        if (k && !byAmt[k]) byAmt[k] = t; // first match wins
      }
    }
    return { byId, byNum, byAmt, list };
  }

  // ─── Status bar (all pages) ───────────────────────────────────

  let _statusBarEl = null;

  function createStatusBar() {
    if (_statusBarEl) return;
    const bar = document.createElement('div');
    bar.id = 'kyriq-status-bar';
    bar.style.cssText = [
      'position:fixed', 'bottom:0', 'left:0', 'right:0', 'z-index:2147483646',
      'height:28px', 'background:linear-gradient(90deg,#1a1a2e 0%,#16213e 100%)',
      'display:flex', 'align-items:center', 'padding:0 12px', 'gap:8px',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'font-size:11px', 'color:#e5e7eb',
      'border-top:1px solid rgba(255,255,255,0.1)',
      'box-shadow:0 -2px 8px rgba(0,0,0,0.3)', 'pointer-events:auto',
    ].join(';');
    bar.innerHTML = `
      <span style="background:rgba(255,255,255,0.15);border-radius:4px;padding:1px 6px;font-weight:700;font-size:10px;letter-spacing:.5px;color:#fff;">K</span>
      <span id="kyriq-sb-company" style="font-weight:600;color:#d1d5db;">Kyriq</span>
      <span id="kyriq-sb-sep" style="color:rgba(255,255,255,0.3);display:none;">·</span>
      <span id="kyriq-sb-account" style="color:#9ca3af;display:none;"></span>
      <span id="kyriq-sb-status" style="margin-left:auto;font-size:10px;"></span>
    `;
    document.body.appendChild(bar);
    _statusBarEl = bar;
    const existing = parseInt(getComputedStyle(document.body).paddingBottom) || 0;
    if (existing < 28) document.body.style.paddingBottom = Math.max(existing, 28) + 'px';
  }

  async function refreshStatusBar() {
    if (!_statusBarEl) return;
    const compEl   = document.getElementById('kyriq-sb-company');
    const statusEl = document.getElementById('kyriq-sb-status');
    try {
      const sessRes = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
      if (!sessRes?.session) {
        if (compEl) { compEl.textContent = 'Sign in to Kyriq'; compEl.style.color = '#9ca3af'; }
        return;
      }
      const connRes = await chrome.runtime.sendMessage({ type: 'GET_CONNECTIONS' });
      const active  = (connRes?.connections || []).find(c => c.is_active);
      if (!active) {
        if (compEl) { compEl.textContent = 'No QB company connected'; compEl.style.color = '#f59e0b'; }
        return;
      }
      const realmMatch = location.href.match(/company\/(\d+)/);
      const realm = realmMatch ? realmMatch[1] : null;
      const isCurrent = realm && String(active.realm_id) === realm;
      if (compEl) {
        compEl.textContent = active.company_name || `Company ${active.realm_id}`;
        compEl.style.color = isCurrent ? '#d1fae5' : '#fde68a';
      }
      if (statusEl) {
        if (isCurrent) statusEl.innerHTML = '<span style="color:#34d399;">✓ Synced</span>';
        else if (realm) statusEl.innerHTML = '<span style="color:#fbbf24;">⚠ Different company</span>';
        else statusEl.innerHTML = '';
      }
    } catch { /* silent */ }
  }

  // ═══════════════════════════════════════════════════════════════
  //  1. RECONCILIATION PAGE
  // ═══════════════════════════════════════════════════════════════

  /**
   * Strategy to find reconciliation table rows:
   *  A. Link href contains txnId= → most reliable, extract intuit_id directly
   *  B. Row text contains a check number we recognise
   *  C. Row text contains an amount we recognise
   *
   * QB Online uses React with hashed class names, so we scan the row's full
   * text content and any embedded links rather than relying on class names.
   */
  function findReconRows() {
    // QB reconciliation renders either a table or a list of divs.
    // Grab every tr that contains at least one <td>, plus every div/li
    // that looks like a data row (has a link to a QB transaction).
    const candidates = [
      ...document.querySelectorAll('table tbody tr'),
      ...document.querySelectorAll('[class*="row"],[class*="Row"],[class*="transaction"],[class*="Transaction"]'),
    ];
    // Deduplicate
    return [...new Set(candidates)].filter(el => {
      const text = el.textContent || '';
      // Must have some numeric content (amounts / dates)
      return /\d/.test(text) && el.querySelectorAll('td, [class*="cell"],[class*="Cell"]').length > 1;
    });
  }

  /**
   * Given a row element, return the matching approved-txn record or null.
   * Tries: intuit_id from links → check number text → amount text.
   */
  function matchReconRow(row, lookup) {
    // A. Try intuit_id from any link in the row
    const links = row.querySelectorAll('a[href]');
    for (const a of links) {
      const id = txnIdFromHref(a.getAttribute('href'));
      if (id && lookup.byId[id]) return lookup.byId[id];
    }

    // B. Try check number: find cells that contain a short numeric string (1–6 digits)
    const cells = row.querySelectorAll('td, [class*="cell"],[class*="Cell"]');
    for (const cell of cells) {
      const t = cell.textContent.trim();
      if (/^\d{1,6}$/.test(t)) {
        const norm = normNum(t);
        if (lookup.byNum[norm]) return lookup.byNum[norm];
      }
    }

    // C. Amount fallback: find a cell containing a dollar amount
    for (const cell of cells) {
      const t = cell.textContent.trim().replace(/[$,()]/g, '');
      const amt = normAmt(t);
      if (amt && lookup.byAmt[amt]) return lookup.byAmt[amt];
    }

    return null;
  }

  /**
   * Find the cleared checkbox (or toggle element) within a row.
   * QB sometimes uses:
   *  - input[type="checkbox"]
   *  - A div/span styled as a checkbox at the start of the row
   *  - A click on the row's first cell
   */
  function findClearedCheckbox(row) {
    // Prefer an actual checkbox
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) return cb;

    // QB sometimes uses a custom styled toggle — look for the first clickable
    // element in the first cell
    const firstCell = row.querySelector('td:first-child, [class*="cell"]:first-child,[class*="Cell"]:first-child');
    if (firstCell) {
      const btn = firstCell.querySelector('[role="checkbox"],[role="button"],button,span[tabindex],div[tabindex]');
      if (btn) return btn;
      return firstCell; // click the cell itself
    }
    return null;
  }

  function isAlreadyCleared(row) {
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) return cb.checked;
    // Look for a "cleared" indicator class or aria-checked
    const toggle = row.querySelector('[aria-checked="true"],[class*="cleared"],[class*="Cleared"],[class*="checked"],[class*="Checked"]');
    return !!toggle;
  }

  /** Animate an element out then remove it. */
  function dismissEl(el, delay = 0) {
    if (!el) return;
    setTimeout(() => {
      el.classList.add('kyriq-dismissing');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, delay);
  }

  /** Inject the Kyriq auto-clear button into the reconciliation page header. */
  function injectReconButton(matchCount, totalApproved, onAutoClick, onPreviewClick) {
    const existing = document.getElementById('kyriq-recon-btn-wrap');
    if (existing) existing.remove();

    const wrap = document.createElement('div');
    wrap.id = 'kyriq-recon-btn-wrap';

    const pill = document.createElement('div');
    pill.id = 'kyriq-recon-pill';

    const logo = document.createElement('div');
    logo.className = 'kyriq-k-logo';
    logo.textContent = 'K';

    const count = document.createElement('span');
    count.className = 'kyriq-recon-count';
    count.textContent = matchCount;

    const sub = document.createElement('span');
    sub.className = 'kyriq-recon-sub';
    sub.textContent = `matched · ${totalApproved} approved`;

    const previewBtn = document.createElement('button');
    previewBtn.className = 'kyriq-recon-action-btn preview';
    previewBtn.textContent = 'Preview';
    previewBtn.addEventListener('click', onPreviewClick);

    const autoBtn = document.createElement('button');
    autoBtn.className = 'kyriq-recon-action-btn go';
    autoBtn.textContent = matchCount > 0 ? `Auto-Clear ${matchCount}` : 'No matches';
    autoBtn.disabled = matchCount === 0;
    autoBtn.addEventListener('click', onAutoClick);

    pill.append(logo, count, sub, previewBtn, autoBtn);
    wrap.appendChild(pill);
    document.body.appendChild(wrap);

    return { wrap, autoBtn };
  }

  function highlightRow(row, color) {
    row.style.outline = `2px solid ${color}`;
    row.style.outlineOffset = '-1px';
    row.style.background = color + '22';
    row.dataset.kyriqHighlighted = '1';
  }

  function unhighlightAll() {
    document.querySelectorAll('[data-kyriq-highlighted]').forEach(el => {
      el.style.outline = '';
      el.style.outlineOffset = '';
      el.style.background = '';
      delete el.dataset.kyriqHighlighted;
    });
  }

  async function initReconcilePage() {
    // Wait for QB's transaction table to render
    try {
      await waitForEl('table tbody tr, [class*="reconRow"],[class*="ReconRow"],[class*="reconcileRow"]', 10000);
    } catch {
      log('Reconcile: no transaction rows found yet — will retry on next mutation');
    }

    const lookup = await getApproved();
    const allRows = findReconRows();
    const matched = []; // { row, txn }

    for (const row of allRows) {
      if (isAlreadyCleared(row)) continue; // already checked — skip
      const txn = matchReconRow(row, lookup);
      if (txn) matched.push({ row, txn });
    }

    log(`Reconcile: ${allRows.length} rows found, ${lookup.list.length} approved, ${matched.length} to clear`);

    const { wrap: reconWrap, autoBtn: reconAutoBtn } = injectReconButton(
      matched.length,
      lookup.list.length,
      // Auto-clear handler
      () => {
        let cleared = 0;
        unhighlightAll();
        for (const { row } of matched) {
          const target = findClearedCheckbox(row);
          if (target) {
            target.click();
            // If it was an input[type=checkbox], also dispatch change event
            if (target.tagName === 'INPUT') {
              target.dispatchEvent(new Event('change', { bubbles: true }));
            }
            highlightRow(row, '#059669');
            cleared++;
          }
        }
        // Update button to done state then auto-dismiss after 5 s
        if (reconAutoBtn) {
          reconAutoBtn.textContent = `Cleared ${cleared}`;
          reconAutoBtn.className = 'kyriq-recon-action-btn done';
          reconAutoBtn.disabled = true;
        }
        dismissEl(reconWrap, 5000);
        log(`Reconcile: clicked cleared on ${cleared} rows`);
      },
      // Preview handler
      () => {
        const highlighted = document.querySelectorAll('[data-kyriq-highlighted]');
        if (highlighted.length) {
          unhighlightAll();
          return;
        }
        for (const { row } of matched) {
          highlightRow(row, '#f59e0b');
        }
      }
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  2. BANK FEED / REGISTER PAGE
  // ═══════════════════════════════════════════════════════════════

  function injectBadge(row, txn) {
    if (row.querySelector('.kyriq-badge')) return; // already injected
    const badge = document.createElement('span');
    badge.className = 'kyriq-badge';
    badge.title = `Kyriq: verified check #${txn.doc_number || '?'} — ${txn.payee || ''}`;
    badge.textContent = 'Verified';
    // Append after first visible text cell
    const cells = row.querySelectorAll('td, [class*="cell"],[class*="Cell"]');
    const payeeCell = [...cells].find(c => c.textContent.trim().length > 3);
    if (payeeCell) payeeCell.appendChild(badge);
  }

  async function initBankFeedPage() {
    try { await waitForEl('table tbody tr, [class*="txn-row"],[class*="TxnRow"]', 8000); }
    catch { return; }

    const lookup = await getApproved();
    if (!lookup.list.length) return;

    const rows = document.querySelectorAll('table tbody tr, [class*="bankTxnRow"],[class*="BankTxnRow"]');
    let badged = 0;
    for (const row of rows) {
      const txn = matchReconRow(row, lookup);
      if (txn) { injectBadge(row, txn); badged++; }
    }
    if (badged) log(`Bank feed: injected ${badged} Kyriq badges`);
  }

  // ═══════════════════════════════════════════════════════════════
  //  3. TRANSACTION DETAIL PAGE
  // ═══════════════════════════════════════════════════════════════

  async function initTransactionDetailPage() {
    // Extract txnId from the URL
    const id = txnIdFromHref(location.href) || txnIdFromHref(location.search);
    if (!id) return;

    const lookup = await getApproved();
    const txn = lookup.byId[id];
    if (!txn) return; // only inject for Kyriq-verified transactions

    // Wait for QB's page header area to render
    const headerSel = 'h1,[class*="headerTitle"],[class*="PageHeader"],[data-automation-id*="title"]';
    let anchor;
    try { anchor = await waitForEl(headerSel, 5000); }
    catch { anchor = document.querySelector('main, #root, body'); }

    if (document.getElementById('kyriq-txn-banner')) return;

    const AUTO_DISMISS_MS = 8000;

    // Build field rows for the banner
    const fields = [];
    if (txn.doc_number) fields.push(['Check #', txn.doc_number]);
    if (txn.txn_date || txn.date) fields.push(['Date', txn.txn_date || txn.date]);
    if (txn.payee)    fields.push(['Payee', txn.payee]);
    if (txn.amount)   fields.push(['Amount', `$${Math.abs(parseFloat(txn.amount)).toFixed(2)}`]);
    if (txn.account)  fields.push(['Account', txn.account]);
    if (txn.approved_at) fields.push(['Approved', new Date(txn.approved_at).toLocaleDateString()]);

    const fieldHTML = fields.map(([label, val]) =>
      `<span class="kyriq-field"><span class="kyriq-field-label">${label}</span>${val}</span>`
    ).join('');

    const banner = document.createElement('div');
    banner.id = 'kyriq-txn-banner';
    banner.innerHTML = `
      <span class="kyriq-icon">✅</span>
      <div class="kyriq-body">
        <div class="kyriq-title">
          Verified by Kyriq
          <span class="kyriq-badge-pill">APPROVED</span>
        </div>
        ${fields.length ? `<div class="kyriq-fields">${fieldHTML}</div>` : ''}
        <a class="kyriq-open-link" href="https://app.qbo.intuit.com/app/reconcile" target="_blank">Open QB Reconcile →</a>
      </div>
      <button class="kyriq-close" title="Dismiss">✕</button>
      <div class="kyriq-progress" style="animation: kyriq-progress ${AUTO_DISMISS_MS / 1000}s linear forwards;"></div>
    `;

    // Close button
    banner.querySelector('.kyriq-close').addEventListener('click', () => dismissEl(banner));

    // Auto-dismiss
    dismissEl(banner, AUTO_DISMISS_MS);

    // Insert before the first heading / after body start
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(banner, anchor);
    } else {
      document.body.prepend(banner);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  ROUTING — detect page and initialise the right automation
  // ═══════════════════════════════════════════════════════════════

  let _currentPage = null;

  async function runPageAutomation() {
    const page = getPageType();
    if (page === _currentPage) return; // already ran for this page
    _currentPage = page;

    if (page === 'reconcile')  { await initReconcilePage(); }
    else if (page === 'bankfeed')   { await initBankFeedPage(); }
    else if (page === 'txndetail')  { await initTransactionDetailPage(); }
  }

  // ─── Detect QB SPA navigation changes ─────────────────────────

  let _lastUrl = location.href;
  const _navObserver = new MutationObserver(() => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      _currentPage = null; // reset so next navigation re-runs automation
      setTimeout(() => {
        refreshStatusBar();
        runPageAutomation();
      }, 1500); // wait for React to render new page content
    }
  });

  // ─── Initialise ───────────────────────────────────────────────

  function init() {
    createStatusBar();
    refreshStatusBar();
    setInterval(refreshStatusBar, 60_000);
    _navObserver.observe(document.body, { childList: true, subtree: true });
    runPageAutomation();
    log('Content script loaded — page:', getPageType());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
