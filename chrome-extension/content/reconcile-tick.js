// Ticks (or unticks) the cleared mark on QuickBooks Reconcile rows, and checks
// every click against QuickBooks' own count of ticked items.
//
// The tick button is a toggle, and its markup did not show which rows were
// ticked: Kyriq clicked rows that were already ticked and switched them off
// (Michael, 17 Nov). The header's "N PAYMENTS" + "N DEPOSITS" moves by exactly
// one per row, so a click is confirmed by the count, and a click that moves it
// the wrong way (the row already was as wanted) is clicked back.
//
// One row at a time, because QuickBooks re-renders the table after each tick and
// a click on a stale button is lost. Without a readable count nothing is clicked.
// A click QuickBooks doesn't count is reported, never retried, and ends the run:
// its count could still arrive and be blamed on the next row.

async function kyriqSettle(done, timeoutMs, pollMs) {
  const deadline = Date.now() + timeoutMs;
  while (!done() && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
}

globalThis.kyriqTickRows = async function kyriqTickRows(keys, {
  findButton, clicked, count, isTicked, want = true, timeoutMs = 5000, pollMs = 100,
}) {
  const step = want ? 1 : -1;
  const out = { confirmed: [], restored: [], unconfirmed: [], unreadable: [] };
  const movedSince = before => { const now = count(); return now == null ? NaN : now - before; };

  for (const key of keys) {
    if (clicked.has(key)) continue;
    const button = findButton(key); // looked up now: an earlier tick may have replaced it
    if (!button) continue;          // not on screen: try again on the next run
    if (isTicked(button) === want) { clicked.add(key); continue; }
    const before = count();
    if (before == null) { out.unreadable.push(key); continue; } // never click blind
    clicked.add(key);
    button.click();
    await kyriqSettle(() => count() !== before, timeoutMs, pollMs);
    const moved = movedSince(before);
    if (moved === step) { out.confirmed.push(key); continue; }
    if (moved === -step) {
      findButton(key)?.click(); // it already was as wanted: put it back
      await kyriqSettle(() => count() === before, timeoutMs, pollMs);
      if (count() === before) { out.restored.push(key); continue; }
    }
    out.unconfirmed.push(key);
    break;
  }
  return out;
};

// The count from the Reconcile header: "13 PAYMENTS" and "0 DEPOSITS", or the
// number and the word as separate text nodes. Reads the page's text in order and
// keeps the first of each, since the header comes before the table (whose TYPE
// column also says "Payment"). null when neither is on the page.
globalThis.kyriqCountFromTexts = function kyriqCountFromTexts(texts) {
  const found = {};
  let prev = '';
  for (const raw of texts) {
    const text = String(raw).trim();
    if (!text) continue;
    let m = text.match(/^(\d[\d,]*)\s*(payment|deposit)s?$/i);
    if (!m && /^\d[\d,]*$/.test(prev)) {
      const word = text.match(/^(payment|deposit)s?$/i);
      if (word) m = [text, prev, word[1]];
    }
    if (m) {
      const kind = m[2].toLowerCase();
      if (!(kind in found)) found[kind] = parseInt(m[1].replace(/,/g, ''), 10);
      if ('payment' in found && 'deposit' in found) break;
    }
    prev = text;
  }
  const kinds = Object.keys(found);
  return kinds.length ? kinds.reduce((sum, kind) => sum + found[kind], 0) : null;
};
