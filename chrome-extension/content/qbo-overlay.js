/**
 * CheckSync Pro — QBO Content Script
 * Injects overlay badges on QuickBooks Online transaction pages
 * Shows a floating panel with match status summary
 */

(function () {
  'use strict';

  // Avoid double injection
  if (window.__checksyncInjected) return;
  window.__checksyncInjected = true;

  let panelOpen = false;
  let matchData = [];

  // ── Create floating action button ────────────────────────────
  function createFAB() {
    if (document.querySelector('.checksync-fab')) return;

    const fab = document.createElement('button');
    fab.className = 'checksync-fab';
    fab.innerHTML = 'CS';
    fab.title = 'CheckSync Pro';
    fab.addEventListener('click', togglePanel);
    document.body.appendChild(fab);
  }

  // ── Create panel ─────────────────────────────────────────────
  function createPanel() {
    if (document.querySelector('.checksync-panel')) return;

    const panel = document.createElement('div');
    panel.className = 'checksync-panel';
    panel.innerHTML = `
      <div class="checksync-panel-header">
        <div class="title">
          <span style="width:20px;height:20px;background:rgba(255,255,255,0.2);border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:900;">CS</span>
          CheckSync Pro
        </div>
        <button class="close-btn" id="checksync-close">&times;</button>
      </div>
      <div class="checksync-panel-body" id="checksync-body">
        <div style="text-align:center;padding:20px;color:#9ca3af;font-size:12px;">
          Loading match data...
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('checksync-close').addEventListener('click', () => {
      panel.classList.remove('open');
      panelOpen = false;
    });
  }

  function togglePanel() {
    const panel = document.querySelector('.checksync-panel');
    if (!panel) return;
    panelOpen = !panelOpen;
    panel.classList.toggle('open', panelOpen);
    if (panelOpen) loadPanelData();
  }

  async function loadPanelData() {
    const body = document.getElementById('checksync-body');
    if (!body) return;

    try {
      // Check if user is logged in
      const sessionRes = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
      if (!sessionRes?.session) {
        body.innerHTML = `
          <div style="text-align:center;padding:20px;">
            <p style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">Not logged in</p>
            <p style="font-size:11px;color:#9ca3af;">Click the CheckSync Pro extension icon to log in.</p>
          </div>
        `;
        return;
      }

      // Get connections
      const connRes = await chrome.runtime.sendMessage({ type: 'GET_CONNECTIONS' });
      const connections = connRes?.connections || [];
      const active = connections.find(c => c.is_active);

      if (!active) {
        body.innerHTML = `
          <div style="text-align:center;padding:20px;">
            <p style="font-size:13px;font-weight:600;color:#374151;">No QB company connected</p>
            <p style="font-size:11px;color:#9ca3af;margin-top:4px;">Connect via extension popup settings.</p>
          </div>
        `;
        return;
      }

      // Try to detect the current QB company from the URL
      const realmMatch = window.location.href.match(/company\/(\d+)/);
      const currentRealm = realmMatch ? realmMatch[1] : null;

      // Show summary
      const companyName = active.company_name || 'Unknown Company';
      const isCurrentCompany = currentRealm && active.realm_id === currentRealm;

      body.innerHTML = `
        <div style="margin-bottom:12px;">
          <div style="font-size:13px;font-weight:700;color:#1a1a2e;">${companyName}</div>
          ${isCurrentCompany
            ? '<div style="font-size:10px;color:#059669;font-weight:600;">✓ Viewing this company in QB</div>'
            : currentRealm
              ? '<div style="font-size:10px;color:#d97706;font-weight:600;">⚠ Different company active in CheckSync</div>'
              : ''
          }
        </div>
        <div class="stat-row">
          <span class="stat-label">Connected companies</span>
          <span class="stat-value">${connections.length}</span>
        </div>
        <div style="padding:12px 0;text-align:center;">
          <p style="font-size:11px;color:#6b7280;">Open the extension popup for full match controls.</p>
          <p style="font-size:10px;color:#9ca3af;margin-top:4px;">Tip: Upload checks & sync to see match badges.</p>
        </div>
        <div style="border-top:1px solid #f3f4f6;padding-top:8px;text-align:center;">
          <span style="font-size:9px;color:#d1d5db;">CheckSync Pro v1.0.0 &middot; $300/yr</span>
        </div>
      `;

      // Try to inject badges into transaction rows
      injectBadges(active.realm_id);
    } catch (e) {
      console.error('CheckSync panel error:', e);
      body.innerHTML = `
        <div style="text-align:center;padding:20px;color:#dc2626;font-size:12px;">
          Error loading data: ${e.message}
        </div>
      `;
    }
  }

  // ── Inject badges into QB transaction rows ───────────────────
  function injectBadges(realmId) {
    // QBO renders transactions in various table formats
    // We look for common selectors used in the register/check register
    const selectors = [
      '.register-line',
      '[data-testid="register-row"]',
      '.tableRow',
      'tr[class*="Transaction"]',
      '.txn-row',
    ];

    // For now, just mark the page as "CheckSync active"
    // Full badge injection requires mapping doc_numbers to match statuses
    // which we'll enhance once the user has real match data
    const existingBadges = document.querySelectorAll('.checksync-badge');
    if (existingBadges.length > 0) return; // Already injected

    // Add a subtle indicator to the page
    console.log('[CheckSync Pro] Active on QBO page. Realm:', realmId);
  }

  // ── Detect QBO navigation changes (SPA) ──────────────────────
  let lastUrl = location.href;
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Re-inject on navigation
      setTimeout(() => {
        createFAB();
        if (panelOpen) loadPanelData();
      }, 1000);
    }
  });

  // ── Initialize ───────────────────────────────────────────────
  function init() {
    createFAB();
    createPanel();
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[CheckSync Pro] Content script loaded');
  }

  // Wait for page to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
