/**
 * Kyriq — QBO Content Script
 *
 * Three active integrations with QB Online pages:
 *
 * 1. RECONCILIATION PAGE  (/app/reconcile)
 *    No injected UI. Automatically ticks the cleared "C" on rows Kyriq approved.
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

  // ─── Extension context guard ──────────────────────────────────
  // MV3 service workers are ephemeral; after an extension reload the content
  // script's chrome.runtime context becomes permanently invalid. Detect that
  // once and stop all polling so the console isn't flooded.
  let _contextInvalidated = false;
  async function safeSendMessage(msg, timeoutMs = 8000) {
    if (_contextInvalidated) return null;
    try {
      return await Promise.race([
        chrome.runtime.sendMessage(msg),
        new Promise((_, rej) => setTimeout(() => rej(new Error('sendMessage timeout')), timeoutMs)),
      ]);
    } catch (e) {
      if (e?.message?.includes('Extension context invalidated') ||
          e?.message?.includes('context invalidated')) {
        _contextInvalidated = true;
        stopApprovedRefresh();
        try { _navObserver?.disconnect(); } catch {}
        clearTimeout(_navDebounceTimer);
        log('Extension reloaded — reload this QB page to reconnect Kyriq.');
        // Show a persistent in-page banner so the user doesn't need DevTools to notice
        if (!document.getElementById('kyriq-reload-banner')) {
          const banner = document.createElement('div');
          banner.id = 'kyriq-reload-banner';
          banner.style.cssText = [
            'position:fixed', 'top:12px', 'right:12px', 'z-index:2147483647',
            'background:#d97706', 'color:#fff', 'font-family:system-ui,sans-serif',
            'font-size:13px', 'font-weight:600', 'padding:10px 14px',
            'border-radius:8px', 'box-shadow:0 4px 12px rgba(0,0,0,0.25)',
            'display:flex', 'align-items:center', 'gap:10px', 'max-width:340px',
          ].join(';');
          banner.innerHTML = '⚠ Kyriq extension updated &mdash; refresh this tab to reconnect. <button id="kyriq-reload-btn" style="background:#fff;color:#d97706;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-weight:700;font-size:12px;">Refresh</button>';
          document.body.appendChild(banner);
          document.getElementById('kyriq-reload-btn')?.addEventListener('click', () => location.reload());
        }
      } else if (e?.message === 'sendMessage timeout') {
        warn('safeSendMessage timed out for', msg?.type);
      }
      return null;
    }
  }

  // Send a one-line log to the side panel. `notify` also shows it to the user.
  function pipeToSidepanel(msg, level = 'info', notify = false) {
    const page = getPageType();
    safeSendMessage({ type: 'KYRIQ_CONTENT_LOG', msg, level, page, notify }).catch(() => {});
  }

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

  /** Normalise a payee name for fuzzy comparison. */
  function normPayee(s) {
    return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  }

  /** Extract the payee name from a row.
   *  1. Legacy QB pages with `<a href>` tx-detail anchors → use that link's text.
   *  2. Modern reconcile/register table with `<td class="...payee...">` cells → read that cell.
   *  3. Last-resort scan: any cell whose text looks like a name (letters, multi-char,
   *     not a date/amount/transaction type). */
  function getRowPayee(row) {
    for (const a of row.querySelectorAll('a[href]')) {
      const t = a.textContent.trim();
      if (t.length > 2 && !/^\$?[\d,]+(\.\d{2})?$/.test(t)) return t;
    }
    const payeeCell = row.querySelector(
      '[class*="payee"]:not([class*="header"]):not([class*="Header"]), [class*="Payee"]:not([class*="header"]):not([class*="Header"])'
    );
    if (payeeCell) {
      const t = payeeCell.textContent.trim();
      if (t.length > 2 && !/^\$?[\d,]+(\.\d{2})?$/.test(t)) return t;
    }
    for (const cell of row.querySelectorAll('td, [class*="cell"]')) {
      const t = cell.textContent.trim();
      if (t.length < 3) continue;
      if (/^\d/.test(t)) continue;
      if (!/[a-zA-Z]/.test(t)) continue;
      if (/^(check|deposit|transfer|journal|expense|bill|payment)$/i.test(t)) continue;
      return t;
    }
    return '';
  }

  /** Detect strict money formatting (e.g. "1,200.00", "$845.00", "9,606.93").
   *  Excludes dates like "05/17/2025" that would otherwise look numeric. */
  const MONEY_RE = /^\$?\d{1,3}(?:,\d{3})*\.\d{2}$|^\$?\d+\.\d{2}$/;

  /** First positive dollar amount found in a row's cells. Prefers cells whose
   *  class hints at money (`amount`, `numeric`, `currency`); falls back to any
   *  cell whose text matches a strict money format. */
  function getRowAmt(row) {
    const cells = [...row.querySelectorAll('td, [class*="cell"],[class*="Cell"]')];
    const moneyCells = cells.filter(c => /amount|numeric|currency|money/i.test(c.className));
    for (const cell of (moneyCells.length ? moneyCells : cells)) {
      const text = cell.textContent.trim();
      if (!MONEY_RE.test(text)) continue;
      const amt = normAmt(text.replace(/[$,()]/g, ''));
      if (amt && parseFloat(amt) > 0) return amt;
    }
    return null;
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

  // ─── Page detection + current account name ────────────────────

  /**
   * Read the account name the user is currently viewing in QB Register/Reconcile.
   * QB shows it in the page heading — e.g. "Checking", "Savings", "Business Checking".
   * Returns null if not determinable (safe fallback: no account scoping applied).
   */
  function getQBAccountName() {
    // Try data-automation-id first (most stable across QB versions)
    const autoEl = document.querySelector(
      '[data-automation-id="page-header"], [data-automation-id="accountName"], ' +
      '[data-testid="account-name"], [data-testid="page-title"]'
    );
    if (autoEl) {
      const txt = autoEl.textContent.trim();
      if (txt && txt.length < 80) return txt;
    }
    // Fallback: first h1/h2 whose text doesn't look like a generic QB nav label
    const SKIP = /^(reconcile|register|banking|transactions|home|dashboard)$/i;
    for (const el of document.querySelectorAll('h1, h2, [class*="pageTitle"],[class*="PageTitle"],[class*="header-title"]')) {
      const txt = el.textContent.trim();
      if (txt && txt.length < 80 && !SKIP.test(txt)) return txt;
    }
    return null;
  }

  /**
   * Returns true when txn.account (from kyriqApproved) is compatible with the
   * page account name. If either side has no account info we allow the match
   * (safe default — intuit_id matches are always trusted regardless).
   */
  function accountMatches(txnAccount, pageAccount) {
    if (!txnAccount || !pageAccount) return true;
    const a = txnAccount.toLowerCase();
    const b = pageAccount.toLowerCase();
    return a.includes(b) || b.includes(a);
  }

  function getPageType() {
    const p = location.pathname + location.search;
    if (/\/reconcile/i.test(p))                                              return 'reconcile';
    if (/\/register/i.test(p))                                               return 'register';
    if (/\/banking|\/bank-transactions/i.test(p))                            return 'bankfeed';
    if (/\/expense|\/check|\/billpayment|\/payment|\/deposit/i.test(p))      return 'txndetail';
    return 'other';
  }

  // True when the register page is using QBO's older Dojo dgrid instead of React.
  function isDgridRegister() {
    return !!document.querySelector('[id^="dgrid_1-row-"]');
  }

  // ─── Overlay visibility (driven by sidepanel liveness + user setting) ──────
  //
  // The service worker tracks two things:
  //   (1) whether the Kyriq sidepanel is currently open (port connected)
  //   (2) the user's kyriqOverlayMode setting: 'whenOpen' | 'always' | 'never'
  //
  // We apply a `.kyriq-overlay-hidden` class on <html> to hide all overlay
  // UI elements when they shouldn't be visible. Content stays in the DOM —
  // cheap to show/hide.

  let _uiState = { sidepanelOpen: false, overlayMode: 'whenOpen' };

  function shouldShowOverlay(state) {
    if (state.overlayMode === 'never')  return false;
    if (state.overlayMode === 'always') return true;
    return !!state.sidepanelOpen; // 'whenOpen' (default)
  }

  function applyOverlayVisibility() {
    const show = shouldShowOverlay(_uiState);
    document.documentElement.classList.toggle('kyriq-overlay-hidden', !show);
  }

  async function fetchInitialUIState() {
    try {
      const res = await safeSendMessage({ type: 'GET_KYRIQ_UI_STATE' });
      if (res) {
        _uiState.sidepanelOpen = !!res.sidepanelOpen;
        _uiState.overlayMode = res.overlayMode || 'whenOpen';
      }
    } catch { /* SW asleep — defaults are safe */ }
    applyOverlayVisibility();
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'KYRIQ_UI_STATE') {
      _uiState.sidepanelOpen = !!msg.sidepanelOpen;
      _uiState.overlayMode   = msg.overlayMode || 'whenOpen';
      applyOverlayVisibility();
    }
    if (msg?.type === 'KYRIQ_APPROVAL_ADDED' && msg.txn) {
      console.log('[Kyriq] received KYRIQ_APPROVAL_ADDED', msg.txn);
      // Invalidate the local cache so the pill button count re-fetches.
      _approvedCache = null;
      _approvedFetchedAt = 0;
      // Immediately click the C button for this row on any open reconcile/register page.
      handleNewApproval(msg.txn);
    }
    if (msg?.type === 'KYRIQ_LOGGED_OUT') {
      _approvedCache = null;
      _approvedFetchedAt = 0;
      removeKyriqUI();
    }
    if (msg?.type === 'KYRIQ_APPROVAL_REMOVED' && msg.txn) {
      console.log('[Kyriq] received KYRIQ_APPROVAL_REMOVED', msg.txn);
      _approvedCache = null;
      _approvedFetchedAt = 0;
      handleRemovedApproval(msg.txn);
    }
    if (msg?.type === 'KYRIQ_FIX_DISCREPANCY' && msg.refNo && msg.corrections) {
      fixDiscrepancy(msg.refNo, msg.corrections)
        .then((status) => sendResponse({ status }))
        .catch((e) => sendResponse({ status: 'error', error: e?.message || String(e) }));
      return true; // keep port open for async sendResponse
    }
  });

  let _newApprovalInFlight = false;
  async function handleNewApproval(newTxn) {
    if (_newApprovalInFlight) {
      // Queue a re-run once the current one finishes rather than dropping the approval.
      setTimeout(() => handleNewApproval(newTxn), 600);
      return;
    }
    _newApprovalInFlight = true;
    try {
      await _handleNewApprovalImpl(newTxn);
    } finally {
      _newApprovalInFlight = false;
    }
  }

  let _removeApprovalInFlight = false;
  async function handleRemovedApproval(oldTxn) {
    if (_removeApprovalInFlight) {
      setTimeout(() => handleRemovedApproval(oldTxn), 600);
      return;
    }
    _removeApprovalInFlight = true;
    try {
      const pt = getPageType();
      const tag = `${oldTxn.payee || ''} #${oldTxn.doc_number || ''} $${oldTxn.amount || ''}`.trim();
      pipeToSidepanel(`Undo received: ${tag} — page=${pt}`, 'info');
      if (pt !== 'reconcile' && pt !== 'register') return;

      await new Promise(r => setTimeout(r, 300));
      const lookup = buildLookup([oldTxn]);
      let unticked = 0;

      if (pt === 'register' && isDgridRegister()) {
        const rows = findDgridRegisterRows();
        for (const row of rows) {
          const match = matchDgridRegisterRow(row, lookup);
          if (!match) continue;
          if (!isDgridRowCleared(row)) continue;
          const result = await setDgridClearState(row, '');
          if (result === 'cleared' || result === 'noop') { unticked++; break; }
        }
        pipeToSidepanel(`Undo (dgrid): ${unticked} row(s) unticked`, unticked ? 'success' : 'warn');
        return;
      }

      const rows = pt === 'reconcile' ? findReconcilePageRows() : findReconRows();
      const matchRow = pt === 'reconcile' ? matchReconcileRow : matchReconRow;
      for (const row of rows) {
        const match = matchRow(row, lookup);
        if (!match) continue;
        const btn = row.querySelector('button[data-testid="clear-state-cell"]');
        if (!btn) continue;
        if (btn.getAttribute('aria-pressed') !== 'true') continue;
        btn.click();
        highlightRow(row, '#9ca3af');
        unticked++;
        pipeToSidepanel(`✓ Unticked C on row #${match.doc_number}`, 'success');
        break;
      }
      if (!unticked) pipeToSidepanel(`Undo: no matching ticked row found for ${tag}`, 'warn');
    } finally {
      _removeApprovalInFlight = false;
    }
  }

  async function _handleNewApprovalImpl(newTxn) {
    const pt = getPageType();
    const tag = `${newTxn.payee || ''} #${newTxn.doc_number || ''} $${newTxn.amount || ''}`.trim();
    console.log('[Kyriq] handleNewApproval — pageType:', pt, 'txn:', newTxn);
    pipeToSidepanel(`Approval received: ${tag} — page=${pt}`, 'info');

    if (pt !== 'reconcile' && pt !== 'register') {
      console.log('[Kyriq] handleNewApproval — not on reconcile/register, skipping click');
      pipeToSidepanel(`Not on reconcile/register page (got: ${pt}). Open QB Reconcile to auto-tick.`, 'warn');
      return;
    }

    // Give the page a moment to render before querying rows.
    await new Promise(r => setTimeout(r, 500));

    // Reconcile: one code path ticks everything approved (incl. this one),
    // so two clickers can never race and toggle a row back off.
    if (pt === 'reconcile') {
      _tickedThisPage.delete(`${normNum(newTxn.doc_number)}|${normAmt(newTxn.amount)}`);
      await autoTickReconcile(true);
      return;
    }

    const lookup = buildLookup([newTxn]);
    let cleared  = 0;
    let didClear = false;

    // ── Dojo dgrid register path ───────────────────────────────────────────────
    if (pt === 'register' && isDgridRegister()) {
      const rows = findDgridRegisterRows();
      pipeToSidepanel(`Dgrid register: scanning ${rows.length} rows for ${tag}`, 'info');
      for (const row of rows) {
        if (didClear) break;
        const match = matchDgridRegisterRow(row, lookup);
        if (!match) continue;
        if (isDgridRowCleared(row)) {
          pipeToSidepanel(`Row already cleared, skipping`, 'info');
          continue;
        }
        pipeToSidepanel(`Row matched #${match.doc_number} — opening dgrid overlay…`, 'info');
        const result = await setDgridClearState(row, 'C');
        pipeToSidepanel(`Dgrid result: ${result}`, result === 'cleared' || result === 'noop' ? 'success' : 'error');
        if (result === 'cleared' || result === 'noop') {
          highlightRow(row, '#059669');
          cleared++;
          didClear = true;
        }
      }
      pipeToSidepanel(`Done (dgrid): ${cleared} row(s) cleared`, cleared ? 'success' : 'warn');
      return;
    }

    // ── React table path (reconcile + React register) ────────────────────────
    const rows    = pt === 'reconcile' ? findReconcilePageRows() : findReconRows();
    const matchRow = pt === 'reconcile' ? matchReconcileRow : matchReconRow;
    pipeToSidepanel(`Scanning ${rows.length} rows for ${tag}`, 'info');
    if (!rows.length) {
      pipeToSidepanel(`No rows found — table.mainTable not present yet`, 'warn');
    }

    for (const row of rows) {
      if (didClear) break;
      const match = matchRow(row, lookup);
      if (!match) continue;
      const btn = row.querySelector('button[data-testid="clear-state-cell"]');
      if (!btn) {
        pipeToSidepanel(`Row matched #${match.doc_number} but no clear button found in DOM`, 'warn');
        continue;
      }
      if (btn.getAttribute('aria-pressed') === 'true') {
        pipeToSidepanel(`Row #${match.doc_number} already cleared`, 'info');
        continue;
      }
      btn.click();
      highlightRow(row, '#059669');
      cleared++;
      didClear = true;
      pipeToSidepanel(`✓ Clicked C on row #${match.doc_number}`, 'success');
    }

    if (!didClear) {
      pipeToSidepanel(`No matching row found on this page for ${tag}`, 'warn');
    }
  }

  // ─── Service-worker bridge ────────────────────────────────────

  let _approvedCache = null;
  let _approvedFetchedAt = 0;

  async function getApproved(forceRefresh = false) {
    const AGE = 60_000;
    if (!forceRefresh && _approvedCache && Date.now() - _approvedFetchedAt < AGE) {
      return _approvedCache;
    }
    const empty = { byId: {}, byNum: {}, byAmt: {}, list: [] };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await safeSendMessage({ type: 'GET_KYRIQ_APPROVED' });
        if (res?.loggedIn === false) {
          _approvedCache = null;
          _approvedFetchedAt = 0;
          removeKyriqUI();
          return empty;
        }
        if (res?.approved) {
          _approvedCache = buildLookup(res.approved);
          _approvedFetchedAt = Date.now();
          return _approvedCache;
        }
        // null response means context invalidated or SW timeout — use stale cache
        break;
      } catch (e) {
        warn(`GET_KYRIQ_APPROVED attempt ${attempt + 1} failed`, e);
        if (attempt < 2) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    return _approvedCache || empty;
  }

  function buildLookup(list) {
    const byId  = {};
    const byNum = {}; // { [normNum]: txn[] } — multiple txns per check number
    const byAmt = {};
    for (const t of list) {
      if (t.intuit_id) byId[String(t.intuit_id)] = t;
      if (t.doc_number) {
        const k = normNum(t.doc_number);
        (byNum[k] = byNum[k] || []).push(t);
      }
      if (t.amount) {
        const k = normAmt(t.amount);
        if (k && !byAmt[k]) byAmt[k] = t;
      }
    }
    return { byId, byNum, byAmt, list };
  }

  /** Remove every piece of Kyriq UI from the page (logout). */
  function removeKyriqUI() {
    unhighlightAll();
    document.querySelectorAll('.kyriq-badge, #kyriq-txn-banner').forEach(el => el.remove());
  }

  // ═══════════════════════════════════════════════════════════════
  //  1. RECONCILIATION PAGE
  // ═══════════════════════════════════════════════════════════════

  // ─── Reconcile-page row finder (table.mainTable, confirmed column map) ───────
  //
  // Confirmed DOM: col 0=date, 1=clearedDate, 2=type, 3=refNo, 4=account,
  //                5=payee, 6=memo, 7=olb-source, 8=payment, 9=deposit, 10=clearState
  //
  // Only used for /app/reconcile* — register uses findReconRows() below.

  function findReconcilePageRows() {
    const table = document.querySelector('table.mainTable');
    if (!table) return [];
    return Array.from(table.querySelectorAll('tbody tr')).filter(row =>
      row.cells?.length >= 11 &&
      row.cells[10]?.querySelector('button[data-testid="clear-state-cell"]')
    );
  }

  function matchReconcileRow(row, lookup) {
    const cells = row.cells;
    if (!cells || cells.length < 11) return null;

    // A. intuit_id from refNo cell link — most reliable
    const refLink = cells[3]?.querySelector('a[href]');
    if (refLink) {
      const id = txnIdFromHref(refLink.getAttribute('href'));
      if (id && lookup.byId[id]) return lookup.byId[id];
    }

    const refNo  = normNum(cells[3]?.textContent.trim());
    const payee  = normPayee(cells[5]?.textContent.trim());
    // Payment column, or deposit column for received cheques.
    const payAmt = normAmt((cells[8]?.textContent || '').replace(/[$,()]/g, '').trim())
                || normAmt((cells[9]?.textContent || '').replace(/[$,()]/g, '').trim());

    // B. refNo + (payee AND amount), then refNo + amount, then refNo + payee
    if (refNo) {
      const cands = lookup.byNum[refNo];
      if (cands?.length) {
        for (const c of cands) {
          const cp = normPayee(c.payee);
          const ca = normAmt(c.amount);
          if (cp && payee && (payee.includes(cp) || cp.includes(payee)) &&
              ca && payAmt && ca === payAmt) return c;
        }
        if (payAmt) for (const c of cands) { if (normAmt(c.amount) === payAmt) return c; }
        if (payee)  for (const c of cands) {
          const cp = normPayee(c.payee);
          if (cp && (payee.includes(cp) || cp.includes(payee))) return c;
        }
      }
    }

    // C. amount + payee fallback
    if (payAmt && payee) {
      const c = lookup.byAmt[payAmt];
      if (c) {
        const cp = normPayee(c.payee);
        if (cp && (payee.includes(cp) || cp.includes(payee))) return c;
      }
    }
    return null;
  }

  // ─── Generic row finder (register + legacy reconcile fallback) ────────────
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
    const candidates = [
      ...document.querySelectorAll('table tbody tr'),
      ...document.querySelectorAll('[class*="row"],[class*="Row"],[class*="transaction"],[class*="Transaction"]'),
    ];
    return [...new Set(candidates)].filter(el => {
      // Primary filter: only rows that actually have a clearable button.
      // This eliminates section headers, summary rows, and container divs that
      // share "row" in their class name but aren't transaction rows.
      if (el.querySelector('button[data-testid="clear-state-cell"]')) return true;

      // Legacy fallback: has a checkbox or a clearState cell AND multiple columns.
      if (el.querySelector('input[type="checkbox"]')) return true;
      if (el.querySelector('td.clearState, [class*="clearState"]')) return true;

      // For table rows: must have a QB transaction link (txnId= in href) — this
      // avoids picking up header/footer rows that happen to contain numbers.
      const hasLink = [...el.querySelectorAll('a[href]')].some(a => txnIdFromHref(a.getAttribute('href')));
      if (hasLink) return true;

      return false;
    });
  }

  /**
   * Given a row element, return the matching approved-txn record or null.
   * Tries: intuit_id from links → check number text → amount text.
   */
  function matchReconRow(row, lookup) {
    // A. intuit_id from link hrefs — most reliable
    const links = row.querySelectorAll('a[href]');
    for (const a of links) {
      const id = txnIdFromHref(a.getAttribute('href'));
      if (id && lookup.byId[id]) return lookup.byId[id];
    }

    const rowPayee = normPayee(getRowPayee(row));
    const rowAmt   = getRowAmt(row);

    // B. Check number → MUST also match amount or payee. QB can have multiple
    //    rows with the same check number (reissues, voids, different vendors),
    //    so check # alone is never sufficient — we verify amount/payee against
    //    every candidate and only match when the row's data agrees.
    const cells = row.querySelectorAll('td, [class*="cell"],[class*="Cell"]');
    for (const cell of cells) {
      const t = cell.textContent.trim();
      if (!/^\d{1,6}$/.test(t)) continue;
      const candidates = lookup.byNum[normNum(t)];
      if (!candidates?.length) continue;

      // 1. payee + amount — strongest, unambiguous match
      for (const c of candidates) {
        const cp = normPayee(c.payee);
        const ca = normAmt(c.amount);
        if (cp && rowPayee && (rowPayee.includes(cp) || cp.includes(rowPayee))
            && ca && rowAmt && ca === rowAmt) return c;
      }
      // 2. exact amount — reliable since QB row amounts come from the txn itself
      if (rowAmt) {
        for (const c of candidates) {
          const ca = normAmt(c.amount);
          if (ca && ca === rowAmt) return c;
        }
      }
      // 3. payee match only — used when the row's amount cell is unreadable
      if (rowPayee) {
        for (const c of candidates) {
          const cp = normPayee(c.payee);
          if (cp && (rowPayee.includes(cp) || cp.includes(rowPayee))) return c;
        }
      }
      // Same check # but neither amount nor payee match → wrong row, do NOT match.
      return null;
    }

    // C. Amount fallback — only when payee ALSO matches. Amount alone is too
    //    weak: two unrelated txns could share a dollar value.
    if (rowAmt && rowPayee) {
      const c = lookup.byAmt[rowAmt];
      if (c) {
        const cp = normPayee(c.payee);
        if (cp && (rowPayee.includes(cp) || cp.includes(rowPayee))) return c;
      }
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
    // Modern QB: <button data-testid="clear-state-cell" aria-pressed="…"> in td.clearState
    const btn = row.querySelector('button[data-testid="clear-state-cell"]');
    if (btn) return btn.getAttribute('aria-pressed') === 'true' ? null : btn;

    // Legacy fallbacks
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) return cb.checked ? null : cb;

    const clearTd = row.querySelector('td.clearState, [class*="clearState"]');
    if (clearTd) return clearTd.querySelector('button') || clearTd;

    return null;
  }

  function isAlreadyCleared(row) {
    const btn = row.querySelector('button[data-testid="clear-state-cell"]');
    if (btn) return btn.getAttribute('aria-pressed') === 'true';

    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) return cb.checked;

    const toggle = row.querySelector('[aria-checked="true"],[class*="cleared"],[class*="Cleared"]');
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

  function highlightRow(row, color) {
    row.style.outline = `2px solid ${color}`;
    row.style.outlineOffset = '-1px';
    row.style.background = color + '22';
    row.dataset.kyriqHighlighted = '1';
  }

  // ═══════════════════════════════════════════════════════════════
  //  SMART FILL — populate QB transaction-detail fields from Kyriq OCR
  // ═══════════════════════════════════════════════════════════════
  //
  // QB Online uses React; setting .value on an input doesn't update React's
  // internal state. The canonical trick is to call the native setter via the
  // property descriptor, then dispatch 'input' + 'change' so React sees it.

  /** Set a value on a React-controlled input/textarea and notify React. */
  function setReactInputValue(el, value) {
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    const setter = descriptor && descriptor.set;
    if (!setter) return false;
    setter.call(el, value == null ? '' : String(value));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  /** Find the first input matching any of the candidate selectors. */
  function findInputByLabel(...labelRegexes) {
    const allInputs = document.querySelectorAll('input, textarea');
    for (const el of allInputs) {
      const label = (
        el.getAttribute('aria-label') || el.getAttribute('placeholder') ||
        el.getAttribute('name')       || el.getAttribute('data-automation-id') || ''
      ).toLowerCase();
      if (!label) continue;
      for (const rx of labelRegexes) {
        if (rx.test(label)) return el;
      }
    }
    return null;
  }

  /**
   * Attempt to select an option in a React-powered combobox/dropdown by typing
   * its text. Works for QB's Payee/Vendor/Customer pickers which open on focus
   * and filter as you type.
   */
  async function selectReactDropdownByText(el, text) {
    if (!el || !text) return false;
    el.focus();
    setReactInputValue(el, text);
    // Give QB's fuzzy matcher a moment to render options
    await new Promise(r => setTimeout(r, 450));
    const options = document.querySelectorAll(
      '[role="option"], [role="listbox"] li, [data-automation-id*="option" i]'
    );
    const target = [...options].find(o => (o.textContent || '').trim().toLowerCase().includes(text.toLowerCase()));
    if (target) {
      target.click();
      return true;
    }
    // Fallback: press Enter to accept first match
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return false;
  }

  /** Main Smart-Fill entry point — called from the txn-detail banner button. */
  async function smartFillFromKyriq(intuitId) {
    const res = await safeSendMessage({ type: 'GET_KYRIQ_MATCH_FOR_TXN', intuitId });
    const match = res?.match;
    if (!match) throw new Error('No Kyriq match found for this transaction');

    const k = match.kyriq_check || {};
    const q = match.qb_entry || {};
    const filled = [];
    const skipped = [];

    // Amount
    const amtEl = findInputByLabel(/amount/i, /total/i);
    const amt = k.amount ?? q.amount;
    if (amtEl && amt != null) {
      if (setReactInputValue(amtEl, parseFloat(amt).toFixed(2))) filled.push('Amount');
      else skipped.push('Amount');
    }

    // Check # / Ref #
    const refEl = findInputByLabel(/^ref/i, /check[ _]?(no|number|#)/i, /reference/i);
    const checkNum = k.check_number || q.check_number;
    if (refEl && checkNum) {
      if (setReactInputValue(refEl, checkNum)) filled.push('Ref #');
      else skipped.push('Ref #');
    }

    // Memo / Description
    const memoEl = findInputByLabel(/memo/i, /description/i);
    const memo = k.memo || q.memo;
    if (memoEl && memo) {
      if (setReactInputValue(memoEl, memo)) filled.push('Memo');
      else skipped.push('Memo');
    }

    // Date (try native date input first, fall back to text MM/DD/YYYY)
    const dateEl = findInputByLabel(/^date/i, /payment date/i, /txn date/i);
    const dt = k.check_date || q.date;
    if (dateEl && dt) {
      const formatted = /^\d{4}-\d{2}-\d{2}$/.test(dt)
        ? dt.slice(5, 7) + '/' + dt.slice(8, 10) + '/' + dt.slice(0, 4)
        : dt;
      if (setReactInputValue(dateEl, formatted)) filled.push('Date');
      else skipped.push('Date');
    }

    // Payee / Vendor (dropdown — best-effort)
    const payeeEl = findInputByLabel(/payee/i, /vendor/i, /customer/i, /who/i);
    const payee = k.payee || q.payee;
    if (payeeEl && payee) {
      const ok = await selectReactDropdownByText(payeeEl, String(payee));
      if (ok) filled.push('Payee');
      else skipped.push('Payee (partial match only)');
    }

    log(`SmartFill: filled=${filled.join(', ') || 'none'}; skipped=${skipped.join(', ') || 'none'}`);
    return { filled, skipped };
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
    // Wait for the confirmed reconcile table root — retried up to 3 times
    let rowsReady = false;
    for (let t = 0; t < 3 && !rowsReady; t++) {
      try {
        await waitForEl('table.mainTable', 10000);
        rowsReady = true;
      } catch {
        if (t < 2) {
          log(`Reconcile: table.mainTable not ready yet (attempt ${t + 1}) — retrying in 2 s`);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          log('Reconcile: table.mainTable not found after 3 attempts — will retry on next mutation');
        }
      }
    }

    await autoTickReconcile();
  }

  // Rows ticked or seen ticked on this page, so a row the user unticks by hand
  // stays unticked. A new approval and navigation both release their keys.
  const _tickedThisPage = new Set();
  function reconcileRowKey(row) {
    const amount = normAmt((row.cells[8]?.textContent || '').replace(/[$,()]/g, '').trim())
                || normAmt((row.cells[9]?.textContent || '').replace(/[$,()]/g, '').trim());
    return `${normNum(row.cells[3]?.textContent.trim())}|${amount}`;
  }

  // Tick the cleared "C" on every reconcile row Kyriq approved. No UI: the
  // human approval already happened in Kyriq. Never unticks, never touches a
  // row that is already cleared. Safe to call repeatedly (60 s refresh +
  // KYRIQ_APPROVAL_ADDED) because each row is only ever clicked once.
  let _autoTickInFlight = false;
  async function autoTickReconcile(forceRefresh = false) {
    if (getPageType() !== 'reconcile' || _autoTickInFlight) return;
    _autoTickInFlight = true;
    try { await _autoTickReconcileImpl(forceRefresh); } finally { _autoTickInFlight = false; }
  }
  async function _autoTickReconcileImpl(forceRefresh) {
    const lookup = await getApproved(forceRefresh);
    if (!lookup.list.length) return; // logged out or nothing approved
    const allRows = findReconcilePageRows();
    const matched = []; // { row, txn }
    const seenTxnIds = new Set();

    for (const row of allRows) {
      if (isAlreadyCleared(row)) { _tickedThisPage.add(reconcileRowKey(row)); continue; }
      const txn = matchReconcileRow(row, lookup);
      if (!txn) continue;
      const key = txn.intuit_id || `${txn.doc_number}|${txn.amount}`;
      if (seenTxnIds.has(key)) continue; // same approval already claimed a row
      seenTxnIds.add(key);
      matched.push({ row, txn });
    }

    // Scope to the current bank account register to avoid cross-account false matches
    const pageAccount = getQBAccountName();
    const accountScoped = pageAccount
      ? matched.filter(m => accountMatches(m.txn.account, pageAccount))
      : matched;
    if (pageAccount) {
      log(`Reconcile: account scope = "${pageAccount}", kept ${accountScoped.length}/${matched.length} matches`);
    }
    const matchedFinal = pageAccount ? accountScoped : matched;
    log(`Reconcile: ${allRows.length} rows found, ${lookup.list.length} approved, ${matchedFinal.length} to clear`);

    const { confirmed, unconfirmed } = await globalThis.kyriqTickRows(
      matchedFinal.map(m => reconcileRowKey(m.row)),
      {
        clicked: _tickedThisPage,
        findButton: key => findReconcilePageRows()
          .find(r => reconcileRowKey(r) === key)
          ?.querySelector('button[data-testid="clear-state-cell"]') || null,
      }
    );
    if (confirmed.length) pipeToSidepanel(`Reconcile: ticked C on ${confirmed.length} Kyriq-approved row(s)`, 'success');
    if (unconfirmed.length) {
      const refs = unconfirmed.map(k => `#${k.split('|')[0] || k}`).join(', ');
      pipeToSidepanel(`QuickBooks didn't confirm the C tick on ${refs}. Please check ${unconfirmed.length === 1 ? 'it' : 'them'} on the Reconcile page.`, 'warn', true);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  2. BANK REGISTER PAGE  (/app/register)
  //
  //  Directly clicks the "C" (Cleared) status cell in each transaction row.
  //  This persists ClearedStatus='Cleared' to QB's backend immediately —
  //  unlike the Reconcile page, which only persists on "Finish Reconciling".
  //
  //  QB's register has a fixed column order:
  //   DATE | REF/TYPE | PAYEE/ACCT | MEMO | PAYMENT | DEPOSIT | <C> | BALANCE
  //  The "C" cell is the second-to-last <td> per row.
  // ═══════════════════════════════════════════════════════════════

  // ─── Dojo dgrid register support ────────────────────────────────────────────
  //
  // When QB renders the register as a Dojo dgrid (older QBO accounts) rather than
  // its React table, rows look like:
  //   <tr id="dgrid_1-row-{txnId}:0">
  //     <td><table class="dgrid-row-table"><tr>
  //       [0]=date [1]=refNo [2]=payee [3]=memo [4]=? [5]=? [6]=payment [7]=deposit [8]=clearState
  //     </tr></table></td>
  //   </tr>
  // Clicking the date cell opens an inline overlay with a clearStateButton (cycles
  // "" → C → R → "") and a button.primary Save that persists via the QBO save API.

  function findDgridRegisterRows() {
    return Array.from(document.querySelectorAll('[id^="dgrid_1-row-"]'));
  }

  function matchDgridRegisterRow(row, lookup) {
    // A. txnId encoded in the row id attribute — most reliable
    const rawId = row.id.replace(/^dgrid_1-row-/, '').split(':')[0];
    if (rawId && lookup.byId[rawId]) return lookup.byId[rawId];

    // B. Column-based fallback using the inner dgrid-row-table
    const innerRow = row.querySelector('table.dgrid-row-table tr');
    if (!innerRow) return null;
    const cells = innerRow.cells;
    if (!cells || cells.length < 7) return null;

    const refNo  = normNum(cells[1]?.textContent.trim());
    const payee  = normPayee(cells[2]?.textContent.trim());
    const payAmt = normAmt((cells[6]?.textContent || '').replace(/[$,()]/g, '').trim()) ||
                   normAmt((cells[7]?.textContent || '').replace(/[$,()]/g, '').trim());

    if (refNo) {
      const cands = lookup.byNum[refNo];
      if (cands?.length) {
        for (const c of cands) {
          const cp = normPayee(c.payee);
          const ca = normAmt(c.amount);
          if (cp && payee && (payee.includes(cp) || cp.includes(payee)) && ca && payAmt && ca === payAmt) return c;
        }
        if (payAmt) for (const c of cands) { if (normAmt(c.amount) === payAmt) return c; }
        if (payee)  for (const c of cands) { const cp = normPayee(c.payee); if (cp && (payee.includes(cp) || cp.includes(payee))) return c; }
      }
    }
    if (payAmt && payee) {
      const c = lookup.byAmt[payAmt];
      if (c) { const cp = normPayee(c.payee); if (cp && (payee.includes(cp) || cp.includes(payee))) return c; }
    }
    return null;
  }

  function isDgridRowCleared(row) {
    const innerRow = row.querySelector('table.dgrid-row-table tr');
    if (!innerRow) return false;
    const cells = innerRow.cells;
    if (!cells || cells.length < 9) return false;
    const txt = (cells[8]?.textContent || '').trim();
    return txt === 'C' || txt === 'R';
  }

  async function setDgridClearState(row, target /* 'C' | 'R' */) {
    try {
      // Check current state to avoid unnecessary click-cycling
      const innerRow = row.querySelector('table.dgrid-row-table tr');
      const cells = innerRow?.cells;
      if (cells && cells.length >= 9 && (cells[8]?.textContent || '').trim() === target) {
        return 'noop';
      }

      // Click the date cell to open the inline editor overlay
      const dateCell = cells?.[0];
      if (!dateCell) return 'failed';
      dateCell.click();

      // Wait for the overlay to appear
      const clearStateBtn = await waitForEl('div.table.overlay button.clearStateButton', 4000);

      // Cycle the button until it shows the target (max 3 clicks: "" → C → R → "")
      for (let i = 0; i < 3; i++) {
        if (clearStateBtn.textContent.trim() === target) break;
        clearStateBtn.click();
        await new Promise(r => setTimeout(r, 150));
      }

      if (clearStateBtn.textContent.trim() !== target) {
        // Couldn't reach target — close without saving
        const overlay = document.querySelector('div.table.overlay');
        const cancelBtn = overlay?.querySelector('button:not(.primary):not(.clearStateButton)');
        cancelBtn?.click();
        return 'failed';
      }

      // Click Save
      const saveBtn = document.querySelector('div.table.overlay button.primary');
      if (!saveBtn) return 'failed';
      saveBtn.click();

      // Wait for overlay to close
      await new Promise(r => setTimeout(r, 600));
      return 'cleared';
    } catch (e) {
      warn('setDgridClearState failed:', e?.message);
      return 'failed';
    }
  }

  /**
   * Find the cleared-status cell in a register row.
   * QB renders it as a clickable <td> that cycles: blank → C → R → blank.
   * We look for a cell containing exactly "C" or "R", or use the column-index
   * heuristic (second-to-last <td> before the BALANCE column).
   */
  function findRegisterClearedCell(row) {
    // Same DOM as Reconcile: <button data-testid="clear-state-cell" aria-pressed="…">.
    // We return the button itself so .click() never reaches the <td>/row (which would
    // bubble into edit-mode and clobber the memo).
    const btn = row.querySelector('button[data-testid="clear-state-cell"]');
    if (btn) return btn;

    const clearTd = row.querySelector('td.clearState, [class*="clearState"]');
    if (clearTd) return clearTd.querySelector('button') || clearTd;

    return null;
  }

  function isRegisterRowCleared(row) {
    const btn = row.querySelector('button[data-testid="clear-state-cell"]');
    if (btn) return btn.getAttribute('aria-pressed') === 'true';

    const cell = row.querySelector('td.clearState, [class*="clearState"]');
    const text = (cell?.textContent || '').trim();
    return text === 'C' || text === 'R';
  }

  async function initRegisterPage() {
    // Detect which DOM variant is in use after waiting for either row type to render.
    // We race between dgrid rows and React table rows so whichever loads wins.
    let detectedDgrid = null;
    for (let t = 0; t < 3 && detectedDgrid === null; t++) {
      try {
        // Race: dgrid rows appear first → dgrid; React table rows → React
        detectedDgrid = await Promise.race([
          waitForEl('[id^="dgrid_1-row-"]', 5000).then(() => true),
          waitForEl('table tbody tr', 5000).then(() => false),
        ]);
      } catch {
        if (t < 2) {
          log(`Register: rows not ready yet (attempt ${t + 1}) — retrying in 2 s`);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          log('Register: no rows found after 3 attempts — will retry on next mutation');
          return;
        }
      }
    }

    if (detectedDgrid === null) return;

    // ── Dojo dgrid variant ────────────────────────────────────────────────────
    if (detectedDgrid) {
      return initDgridRegisterPage();
    }

    // ── React table variant (default) ─────────────────────────────────────────

    const lookup = await getApproved();
    if (!lookup.list.length) return;

    const allRows = findReconRows();
    const matched = [];
    const seenTxnIds = new Set();

    for (const row of allRows) {
      if (isRegisterRowCleared(row)) continue;
      const txn = matchReconRow(row, lookup);
      if (!txn) continue;
      const key = txn.intuit_id || `${txn.doc_number}|${txn.amount}`;
      if (seenTxnIds.has(key)) continue; // same approval already claimed a row
      seenTxnIds.add(key);
      matched.push({ row, txn });
    }

    // Scope to the current bank account register to avoid cross-account false matches
    const regPageAccount = getQBAccountName();
    const regAccountScoped = regPageAccount
      ? matched.filter(m => accountMatches(m.txn.account, regPageAccount))
      : matched;
    if (regPageAccount) {
      log(`Register: account scope = "${regPageAccount}", kept ${regAccountScoped.length}/${matched.length} matches`);
    }
    const regMatchedFinal = regPageAccount ? regAccountScoped : matched;
    log(`Register: ${allRows.length} rows, ${lookup.list.length} approved, ${regMatchedFinal.length} to mark cleared`);
    if (!regMatchedFinal.length) return;

    let cleared = 0;
    for (const { row } of regMatchedFinal) {
      if (isRegisterRowCleared(row)) continue;
      const cell = findRegisterClearedCell(row);
      if (cell) { cell.click(); cleared++; }
    }
    log(`Register: marked cleared on ${cleared} rows`);
  }

  async function initDgridRegisterPage() {
    // Wait for dgrid rows to appear
    let rowsReady = false;
    for (let t = 0; t < 3 && !rowsReady; t++) {
      try {
        await waitForEl('[id^="dgrid_1-row-"]', 8000);
        rowsReady = true;
      } catch {
        if (t < 2) {
          log(`DgridRegister: rows not ready yet (attempt ${t + 1}) — retrying in 2 s`);
          await new Promise(r => setTimeout(r, 2000));
        } else {
          log('DgridRegister: no dgrid rows found after 3 attempts — will retry on next mutation');
          return;
        }
      }
    }

    const lookup = await getApproved();
    if (!lookup.list.length) return;

    const allRows = findDgridRegisterRows();
    const matched = [];
    const seenTxnIds = new Set();

    for (const row of allRows) {
      if (isDgridRowCleared(row)) continue;
      const txn = matchDgridRegisterRow(row, lookup);
      if (!txn) continue;
      const key = txn.intuit_id || `${txn.doc_number}|${txn.amount}`;
      if (seenTxnIds.has(key)) continue;
      seenTxnIds.add(key);
      matched.push({ row, txn });
    }

    log(`DgridRegister: ${allRows.length} rows, ${lookup.list.length} approved, ${matched.length} to mark cleared`);
    if (!matched.length) return;

    // Dgrid requires sequential overlay interaction — cannot parallelize.
    let cleared = 0;
    for (const { row } of matched) {
      const result = await setDgridClearState(row, 'C');
      if (result === 'cleared' || result === 'noop') cleared++;
    }
    log(`DgridRegister: marked cleared on ${cleared} rows`);
  }

  // ═══════════════════════════════════════════════════════════════
  //  4. BANK FEED PAGE  (/app/banking, /app/bank-transactions)
  // ═══════════════════════════════════════════════════════════════

  function injectBadge(row, txn) {
    if (row.querySelector('.kyriq-badge')) return; // already injected
    const badge = document.createElement('span');
    badge.className = 'kyriq-badge';
    const _amt = txn.amount != null ? `$${Math.abs(parseFloat(txn.amount)).toFixed(2)}` : '';
    const _dt  = txn.txn_date || txn.date || '';
    badge.title = [
      'Kyriq Verified ✓',
      txn.doc_number ? `Check #${txn.doc_number}` : '',
      txn.payee      ? `Payee: ${txn.payee}`       : '',
      _amt           ? `Amount: ${_amt}`            : '',
      _dt            ? `Date: ${_dt}`               : '',
    ].filter(Boolean).join('\n');
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
  //  5. TRANSACTION DETAIL PAGE
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
      <img class="kyriq-icon" alt="Kyriq"
           src="${chrome.runtime.getURL('icons/icon32.png')}">
      <div class="kyriq-body">
        <div class="kyriq-title">
          Verified by Kyriq
          <span class="kyriq-badge-pill">APPROVED</span>
        </div>
        ${fields.length ? `<div class="kyriq-fields">${fieldHTML}</div>` : ''}
        <div class="kyriq-actions">
          <button class="kyriq-smart-fill-btn" data-intuit-id="${id}">⚡ Smart Fill from Kyriq</button>
          <a class="kyriq-open-link" href="https://app.qbo.intuit.com/app/reconcile" target="_blank">Open QB Reconcile →</a>
        </div>
      </div>
      <button class="kyriq-close" title="Dismiss">✕</button>
      <div class="kyriq-progress" style="animation: kyriq-progress ${AUTO_DISMISS_MS / 1000}s linear forwards;"></div>
    `;

    // Close button
    banner.querySelector('.kyriq-close').addEventListener('click', () => dismissEl(banner));

    // Smart-fill button
    banner.querySelector('.kyriq-smart-fill-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '⏳ Filling…';
      try {
        const summary = await smartFillFromKyriq(id);
        btn.textContent = summary.filled.length
          ? `✓ Filled ${summary.filled.length} field${summary.filled.length === 1 ? '' : 's'}`
          : '⚠ No fields matched';
        if (summary.filled.length) {
          // Stop auto-dismiss so user can review
          banner.querySelector('.kyriq-progress')?.remove();
        }
      } catch (err) {
        btn.textContent = `⚠ ${err?.message || 'Fill failed'}`;
      }
    });

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

  let _pageAutomationInFlight = false;
  async function runPageAutomation() {
    const page = getPageType();
    if (page === _currentPage) return; // already ran for this page
    if (_pageAutomationInFlight) return; // previous init still running
    _currentPage = page;
    _pageAutomationInFlight = true;
    try {
      if (page === 'reconcile')       { await initReconcilePage(); }
      else if (page === 'register')   { await initRegisterPage(); }
      else if (page === 'bankfeed')   { await initBankFeedPage(); }
      else if (page === 'txndetail')  { await initTransactionDetailPage(); }
    } catch (e) {
      warn('runPageAutomation error', e?.message);
      _currentPage = null; // allow retry on next nav
    } finally {
      _pageAutomationInFlight = false;
    }
  }

  // ─── Detect QB SPA navigation changes ─────────────────────────

  let _lastUrl = location.href;
  let _navDebounceTimer = null;
  const _navObserver = new MutationObserver(() => {
    if (location.href !== _lastUrl) {
      _lastUrl = location.href;
      _currentPage = null; // reset so next navigation re-runs automation
      _tickedThisPage.clear();
      clearTimeout(_navDebounceTimer); // cancel any in-flight nav timer
      _navDebounceTimer = setTimeout(() => {
        _navDebounceTimer = null;
        runPageAutomation();
      }, 1500); // wait for React to render new page content
    }
  });

  // ─── Initialise ───────────────────────────────────────────────

  // Visibility-gated 60 s re-check: ticks newly approved reconcile rows, and
  // learns about logout (GET_KYRIQ_APPROVED → loggedIn:false clears our UI).
  let _refreshTimer = null;
  function startApprovedRefresh() {
    if (_refreshTimer) return;
    _refreshTimer = setInterval(() => {
      if (document.visibilityState === 'visible') autoTickReconcile(true);
    }, 60_000);
  }
  function stopApprovedRefresh() {
    if (_refreshTimer) { clearInterval(_refreshTimer); _refreshTimer = null; }
  }
  window.addEventListener('beforeunload', () => {
    stopApprovedRefresh();
    clearTimeout(_navDebounceTimer);
    try { _navObserver.disconnect(); } catch {}
  });

  function injectOverlayHideStyles() {
    // One-time <style> injection so .kyriq-overlay-hidden hides our DOM.
    // Using display:none prevents interaction and layout — cheaper than removing.
    if (document.getElementById('kyriq-overlay-style')) return;
    const s = document.createElement('style');
    s.id = 'kyriq-overlay-style';
    s.textContent = `
      html.kyriq-overlay-hidden #kyriq-txn-banner,
      html.kyriq-overlay-hidden .kyriq-badge { display: none !important; }
    `;
    document.documentElement.appendChild(s);
  }

  // ── Discrepancy fix: push OCR'd amount into QB reconcile inline editor ────────
  function setNativeValue(el, value) {
    const proto  = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter ? setter.call(el, value) : (el.value = value);
  }

  async function fixDiscrepancy(refNo, corrections) {
    if (getPageType() !== 'reconcile') return 'wrong_page';

    const rows = findReconcilePageRows();
    let target = null;
    for (const row of rows) {
      const refText = row.cells[3]?.textContent?.trim() || '';
      if (refText === String(refNo)) { target = row; break; }
    }
    if (!target) return 'not_found';

    // Click the date cell (cells[1]) to open QB's inline edit overlay —
    // same column that setDgridClearState uses; QB reconcile React rows respond
    // the same way and surface a div.table.overlay above the row.
    const clickCell = target.cells[1] || target.cells[0];
    if (!clickCell) return 'no_editor';
    pipeToSidepanel(`Fix: opening inline editor for row #${refNo}…`, 'info');
    clickCell.click();

    // Wait for the edit overlay and the amount input inside it.
    const overlay = await waitForEl('div.table.overlay', 4000);
    if (!overlay) return 'editor_not_open';

    const input = overlay.querySelector('input[name="row_amount"]')
               || overlay.querySelector('input[name="row_payment"]')
               || overlay.querySelector('input[type="number"], input[type="text"]');
    if (!input) return 'editor_not_open';

    if (corrections.payment != null) {
      pipeToSidepanel(`Fix: setting amount to ${corrections.payment}`, 'info');
      setNativeValue(input, String(corrections.payment));
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    }

    // Save button lives inside the overlay (same as setDgridClearState:1079).
    const saveBtn = overlay.querySelector('button.primary')
                 || overlay.querySelector('button[data-testid="save"]')
                 || overlay.querySelector('button[type="submit"]');
    if (!saveBtn) {
      // Close overlay without saving rather than leave it dangling.
      const cancelBtn = overlay.querySelector('button:not(.primary)');
      cancelBtn?.click();
      return 'save_not_found';
    }
    pipeToSidepanel(`Fix: clicking Save for row #${refNo}`, 'info');
    saveBtn.click();

    // Wait for the overlay to close, then verify.
    await new Promise(r => setTimeout(r, 800));
    const after = findReconcilePageRows().find(r => r.cells[3]?.textContent?.trim() === String(refNo));
    if (after && corrections.payment != null) {
      const amtText = (after.cells[8]?.textContent || '').replace(/[$,()]/g, '').trim();
      if (amtText && Math.abs(parseFloat(amtText) - parseFloat(corrections.payment)) < 0.01) {
        pipeToSidepanel(`Fix: row #${refNo} verified at $${corrections.payment}`, 'success');
        return 'saved';
      }
    }
    pipeToSidepanel(`Fix: save clicked for row #${refNo} — could not verify amount in DOM`, 'warn');
    return 'saved_unverified';
  }

  function init() {
    injectOverlayHideStyles();
    startApprovedRefresh();
    fetchInitialUIState(); // hide immediately if sidepanel is closed + mode is whenOpen
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
