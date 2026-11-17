#!/usr/bin/env node
// `node chrome-extension/check-reconcile-tick.mjs`
// Fake QuickBooks Reconcile rows for the failures seen on the real page.
import assert from 'node:assert/strict';
await import('./content/reconcile-tick.js');
const tick = globalThis.kyriqTickRows;
const fast = { timeoutMs: 40, pollMs: 2 };

// A toggle like QuickBooks': each click flips it and `render` swaps the element.
// Its aria-pressed always says "false", as on Michael's page, so only the
// header count (ticked rows, plus 9 ticked off screen) tells the truth.
function table(keys, { ticked = [], loseClicks = [], unreadable = false } = {}) {
  const on = Object.fromEntries(keys.map(k => [k, ticked.includes(k)]));
  const clicks = Object.fromEntries(keys.map(k => [k, 0]));
  let renders = 0;
  const button = (key, render) => ({
    key,
    getAttribute: () => 'false',
    click() {
      assert.equal(render, renders, `clicked a stale button for ${key}`);
      clicks[key]++;
      if (loseClicks.includes(key)) return;
      setTimeout(() => { on[key] = !on[key]; renders++; }, 5);
    },
  });
  return {
    on,
    clicks,
    findButton: key => (key in on ? button(key, renders) : null),
    count: () => (unreadable ? null : 9 + Object.values(on).filter(Boolean).length),
    isTicked: () => null, // the markup can't tell
  };
}
const opts = (t, more = {}) => ({ ...fast, findButton: t.findButton, count: t.count, isTicked: t.isTicked, clicked: new Set(), ...more });

// Re-render after every tick: all rows end up ticked, with no stale clicks.
{
  const t = table(['a', 'b', 'c']);
  const r = await tick(['a', 'b', 'c'], opts(t));
  assert.deepEqual(r.confirmed, ['a', 'b', 'c']);
  assert.deepEqual(t.on, { a: true, b: true, c: true });
}

// Michael, 17 Nov: rows he had ticked were switched off. A row that is already
// ticked, which the markup can't show, ends ticked: the second click puts it back.
{
  const t = table(['a', 'b'], { ticked: ['a'] });
  const r = await tick(['a', 'b'], opts(t));
  assert.deepEqual(t.on, { a: true, b: true });
  assert.deepEqual(r.restored, ['a']);
  assert.deepEqual(r.confirmed, ['b']);
  assert.deepEqual(t.clicks, { a: 2, b: 1 });
}

// When the markup can tell, a ticked row isn't clicked at all.
{
  const t = table(['a', 'b'], { ticked: ['a'] });
  const r = await tick(['a', 'b'], opts(t, { isTicked: b => t.on[b.key] }));
  assert.deepEqual(t.clicks, { a: 0, b: 1 });
  assert.deepEqual(r.confirmed, ['b']);
}

// No readable count: nothing is clicked, and the rows stay for a later run.
{
  const t = table(['a', 'b'], { unreadable: true });
  const clicked = new Set();
  const r = await tick(['a', 'b'], opts(t, { clicked }));
  assert.deepEqual(r.unreadable, ['a', 'b']);
  assert.deepEqual(t.clicks, { a: 0, b: 0 });
  assert.equal(clicked.size, 0);
}

// The 60-second re-run must not toggle anything back off.
{
  const t = table(['a', 'b']);
  const clicked = new Set();
  await tick(['a', 'b'], opts(t, { clicked }));
  const again = await tick(['a', 'b'], opts(t, { clicked }));
  assert.deepEqual(again, { confirmed: [], restored: [], unconfirmed: [], unreadable: [] });
  assert.deepEqual(t.clicks, { a: 1, b: 1 });
}

// A lost click is reported, not retried, and ends the run; the next run goes on.
{
  const t = table(['a', 'b'], { loseClicks: ['a'] });
  const clicked = new Set();
  const r = await tick(['a', 'b'], opts(t, { clicked }));
  assert.deepEqual(r.unconfirmed, ['a']);
  assert.equal(t.clicks.b, 0);
  await tick(['a', 'b'], opts(t, { clicked }));
  assert.deepEqual(t.clicks, { a: 1, b: 1 });
  assert.equal(t.on.b, true);
}

// A row not on screen isn't used up, so a later run can still tick it.
{
  const t = table(['a']);
  const clicked = new Set();
  await tick(['missing'], opts(t, { clicked }));
  assert.equal(clicked.has('missing'), false);
}

// Undo: the ticked row is unticked; an unticked one is left (clicked back).
{
  const t = table(['a', 'b'], { ticked: ['a'] });
  const r = await tick(['a', 'b'], opts(t, { want: false }));
  assert.deepEqual(t.on, { a: false, b: false });
  assert.deepEqual(r.confirmed, ['a']);
  assert.deepEqual(r.restored, ['b']);
}

// The header count, however QuickBooks splits the text.
{
  const count = globalThis.kyriqCountFromTexts;
  assert.equal(count(['$97,612.10', '13 PAYMENTS', '$0.00', '0 DEPOSITS']), 13);
  assert.equal(count(['$97,612.10', '13', 'PAYMENTS', '$0.00', '2', 'DEPOSITS']), 15);
  assert.equal(count(['1 payment']), 1);
  assert.equal(count(['1,204 payments', '3 deposits']), 1207);
  // The filter tabs and the column headers are not counts.
  assert.equal(count(['Clear filter / View all', 'Payments', 'Deposits', 'All', 'PAYMENT (USD)']), null);
  // The header wins over a "Payment" in the table below it.
  assert.equal(count(['9 PAYMENTS', '0 DEPOSITS', '1001', 'Payment']), 9);
}

console.log('reconcile tick checks passed');
